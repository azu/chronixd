import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLogger } from "../common/logger.js";
import {
    type OnePasswordCommandRunner,
    readOuraOnePasswordTokenState,
    writeOuraOnePasswordTokenState,
} from "./oura-onepassword.js";
import { OURA_AUTHORIZE_URL, OURA_TOKEN_URL, type OuraEnv } from "./oura.js";

const OURA_SCOPE = "daily";
const OURA_CALLBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const OURA_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const logger = createLogger("OuraAuth");

type OuraAuthorizationConfig = OuraEnv & {
    oura_redirect_uri: string;
};

type OuraTokenResponse = {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
};

export type OuraAuthorizationDependencies = {
    fetch?: OuraAuthorizationFetch;
    onePasswordCommandRunner?: OnePasswordCommandRunner;
    openUrl?: (url: string) => Promise<void>;
    startCallbackServer?: StartOuraLoopbackCallbackServer;
    callbackTimeoutMs?: number;
    createState?: () => string;
    now?: () => number;
    log?: (message: string) => void;
};

export type OuraLoopbackCallbackServer = {
    redirectUri: string;
    code: Promise<string>;
    close: () => Promise<void>;
};

export type StartOuraLoopbackCallbackServer = (
    redirectUri: string,
    expectedState: string,
    timeoutMs?: number,
) => Promise<OuraLoopbackCallbackServer>;

export type OuraAuthorizationFetch = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === "string" && value.length > 0;
};

const parseAuthorizationConfig = (env: OuraEnv): OuraAuthorizationConfig => {
    if (!isNonEmptyString(env.oura_redirect_uri)) {
        throw new Error("Oura authorization requires oura_redirect_uri in CHRONIXD_ENVS");
    }
    let redirectUri: URL;
    try {
        redirectUri = new URL(env.oura_redirect_uri);
    } catch {
        throw new Error("oura_redirect_uri must be a valid URL");
    }
    if (
        redirectUri.protocol !== "http:"
        || !OURA_CALLBACK_HOSTS.has(redirectUri.hostname)
        || !redirectUri.port
        || Number(redirectUri.port) === 0
        || redirectUri.username
        || redirectUri.password
        || redirectUri.hash
    ) {
        throw new Error("oura_redirect_uri must be an HTTP loopback URL such as http://localhost:64321/oauth/callback");
    }
    return env as OuraAuthorizationConfig;
};

export const createOuraAuthorizationUrl = (
    env: OuraEnv,
    state: string,
): string => {
    const config = parseAuthorizationConfig(env);
    const url = new URL(OURA_AUTHORIZE_URL);
    url.search = new URLSearchParams({
        response_type: "code",
        client_id: config.oura_client_id,
        redirect_uri: config.oura_redirect_uri,
        scope: OURA_SCOPE,
        state,
    }).toString();
    return url.toString();
};

const redirectTargetsMatch = (expected: URL, actual: URL): boolean => {
    if (expected.protocol !== actual.protocol || expected.host !== actual.host || expected.pathname !== actual.pathname) {
        return false;
    }
    for (const key of new Set(expected.searchParams.keys())) {
        if (JSON.stringify(expected.searchParams.getAll(key)) !== JSON.stringify(actual.searchParams.getAll(key))) {
            return false;
        }
    }
    return true;
};

export const parseOuraAuthorizationRedirect = (
    value: string,
    expectedState: string,
    expectedRedirectUri: string,
): string => {
    let redirect: URL;
    try {
        redirect = new URL(value.trim());
    } catch {
        throw new Error("The Oura redirect is not a valid URL");
    }
    if (!redirectTargetsMatch(new URL(expectedRedirectUri), redirect)) {
        throw new Error("The Oura redirect does not match oura_redirect_uri");
    }
    if (redirect.searchParams.get("state") !== expectedState) {
        throw new Error("The Oura authorization state did not match; restart authorization");
    }
    const oauthError = redirect.searchParams.get("error");
    if (oauthError) {
        const detail = redirect.searchParams.get("error_description");
        throw new Error(`Oura authorization failed: ${oauthError}${detail ? ` (${detail.slice(0, 200)})` : ""}`);
    }
    const grantedScope = redirect.searchParams.get("scope");
    if (grantedScope !== null) {
        const scopes = grantedScope.split(/\s+/).filter(Boolean);
        if (!scopes.includes(OURA_SCOPE)) {
            throw new Error(`Oura authorization did not grant the required '${OURA_SCOPE}' scope`);
        }
    }
    const code = redirect.searchParams.get("code");
    if (!isNonEmptyString(code)) {
        throw new Error("The Oura redirect URL did not contain an authorization code");
    }
    return code;
};

const redactSecrets = (value: string, secrets: string[]): string => {
    return secrets
        .filter(isNonEmptyString)
        .reduce((redacted, secret) => redacted.replaceAll(secret, "[REDACTED]"), value)
        .replace(/\x1b\[[0-9;]*m/g, "")
        .trim()
        .slice(0, 500);
};

const describeErrorResponse = async (response: Response, secrets: string[]): Promise<string> => {
    const text = await response.text();
    if (!text) return "";
    try {
        const body = JSON.parse(text) as Record<string, unknown>;
        const detail = body.error_description ?? body.detail ?? body.title ?? body.error;
        if (typeof detail === "string") return redactSecrets(detail, secrets);
    } catch {
        // Fall back to a redacted response body below.
    }
    return redactSecrets(text, secrets);
};

export const openUrlInBrowser = (url: string): Promise<void> => {
    const command = process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : null;
    if (!command) {
        return Promise.reject(new Error(`Automatic browser opening is not supported on ${process.platform}`));
    }
    return new Promise((resolve, reject) => {
        const child = spawn(command, [url], {
            detached: true,
            stdio: "ignore",
        });
        child.once("error", reject);
        child.once("spawn", () => {
            child.unref();
            resolve();
        });
    });
};

const writeCallbackResponse = (
    response: import("node:http").ServerResponse,
    status: number,
    title: string,
    message: string,
): void => {
    response.writeHead(status, {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
    });
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><body><h1>${title}</h1><p>${message}</p></body></html>`);
};

const closeServer = (server: Server): Promise<void> => {
    if (!server.listening) return Promise.resolve();
    return new Promise((resolve) => server.close(() => resolve()));
};

export const startOuraLoopbackCallbackServer: StartOuraLoopbackCallbackServer = async (
    redirectUri,
    expectedState,
    timeoutMs = OURA_CALLBACK_TIMEOUT_MS,
) => {
    const configuredRedirect = new URL(redirectUri);
    if (configuredRedirect.protocol !== "http:" || !OURA_CALLBACK_HOSTS.has(configuredRedirect.hostname)) {
        throw new Error("Oura callback server only listens on localhost or 127.0.0.1");
    }
    const port = Number(configuredRedirect.port);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error("oura_redirect_uri must include a valid port");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("Oura callback timeout must be greater than zero");
    }

    let callbackRedirect = configuredRedirect;
    let resolveCode: (code: string) => void = () => {};
    let rejectCode: (error: Error) => void = () => {};
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const code = new Promise<string>((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
    });
    const finish = (result: { code: string } | { error: Error }): void => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if ("code" in result) {
            resolveCode(result.code);
        } else {
            rejectCode(result.error);
        }
    };

    const server = createServer((request, response) => {
        if (request.method !== "GET" || !request.url) {
            writeCallbackResponse(response, 404, "Not found", "This server only accepts the Oura OAuth callback.");
            return;
        }

        const requestUrl = new URL(request.url, callbackRedirect.origin);
        if (!redirectTargetsMatch(callbackRedirect, requestUrl)) {
            writeCallbackResponse(response, 404, "Not found", "This is not the configured Oura OAuth callback path.");
            return;
        }
        if (requestUrl.searchParams.get("state") !== expectedState) {
            writeCallbackResponse(response, 400, "Authorization rejected", "The OAuth state did not match. Restart authorization from the terminal.");
            return;
        }

        try {
            const authorizationCode = parseOuraAuthorizationRedirect(
                requestUrl.toString(),
                expectedState,
                callbackRedirect.toString(),
            );
            writeCallbackResponse(response, 200, "Oura authorization complete", "You can close this tab and return to chronixd.");
            finish({ code: authorizationCode });
        } catch (error) {
            writeCallbackResponse(response, 400, "Oura authorization failed", "Return to the terminal for details.");
            finish({ error: error as Error });
        }
    });

    await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once("error", onError);
        server.listen(port, configuredRedirect.hostname, () => {
            server.off("error", onError);
            resolve();
        });
    }).catch((error) => {
        throw new Error(`Could not start the Oura callback server at ${redirectUri}: ${(error as Error).message}`);
    });

    const address = server.address() as AddressInfo;
    callbackRedirect = new URL(configuredRedirect);
    callbackRedirect.port = String(address.port);
    server.on("error", (error) => finish({ error: new Error(`Oura callback server failed: ${error.message}`) }));
    timeout = setTimeout(() => {
        finish({ error: new Error("Timed out waiting for the Oura authorization callback") });
    }, timeoutMs);

    return {
        redirectUri: callbackRedirect.toString(),
        code,
        close: async () => {
            if (timeout) clearTimeout(timeout);
            await closeServer(server);
        },
    };
};

export const authorizeOura = async (
    env: OuraEnv,
    dependencies: OuraAuthorizationDependencies = {},
): Promise<void> => {
    if (Boolean(process.env.CHRONIXD_DRY_RUN)) {
        throw new Error("Oura authorization is disabled in CHRONIXD_DRY_RUN because it writes tokens to 1Password");
    }
    const config = parseAuthorizationConfig(env);
    const state = (dependencies.createState ?? (() => randomBytes(32).toString("base64url")))();
    const authorizationUrl = createOuraAuthorizationUrl(config, state);
    const log = dependencies.log ?? ((message: string) => logger.info("%s", message));
    const callbackServer = await (dependencies.startCallbackServer ?? startOuraLoopbackCallbackServer)(
        config.oura_redirect_uri,
        state,
        dependencies.callbackTimeoutMs,
    );
    let code: string;
    try {
        log(`Waiting for the Oura callback at ${callbackServer.redirectUri}`);
        log(`Open this Oura authorization URL:\n${authorizationUrl}`);
        try {
            await (dependencies.openUrl ?? openUrlInBrowser)(authorizationUrl);
        } catch (error) {
            log(`Could not open the browser automatically: ${(error as Error).message}`);
        }
        code = await callbackServer.code;
    } finally {
        await callbackServer.close();
    }
    const secrets = [code, config.oura_client_id, config.oura_client_secret];
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.oura_client_id,
        client_secret: config.oura_client_secret,
        redirect_uri: config.oura_redirect_uri,
    });

    let response: Response;
    try {
        response = await (dependencies.fetch ?? globalThis.fetch)(OURA_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
    } catch (error) {
        const detail = redactSecrets((error as Error).message, secrets);
        throw new Error(`Oura token exchange outcome is unknown; restart authorization instead of retrying the code (${detail})`);
    }
    if (!response.ok) {
        const detail = await describeErrorResponse(response, secrets);
        throw new Error(`Oura token exchange failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail ? `: ${detail}` : ""}`);
    }

    let tokens: OuraTokenResponse;
    try {
        tokens = (await response.json()) as OuraTokenResponse;
    } catch {
        throw new Error("Oura token exchange returned invalid JSON; restart authorization");
    }
    if (!isNonEmptyString(tokens.access_token) || !isNonEmptyString(tokens.refresh_token)) {
        throw new Error("Oura token exchange response did not include access_token and refresh_token; restart authorization");
    }
    const expiresAt = typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in) && tokens.expires_in > 0
        ? (dependencies.now ?? Date.now)() + tokens.expires_in * 1000
        : undefined;
    const tokenState = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
    };
    const onePasswordConfig = {
        vault: config.oura_1password_vault,
        item: config.oura_1password_item,
    };
    const runner = dependencies.onePasswordCommandRunner;
    try {
        await writeOuraOnePasswordTokenState(onePasswordConfig, tokenState, runner);
        const stored = await readOuraOnePasswordTokenState(onePasswordConfig, runner);
        if (
            stored.accessToken !== tokenState.accessToken
            || stored.refreshToken !== tokenState.refreshToken
            || stored.expiresAt !== tokenState.expiresAt
        ) {
            throw new Error("1Password read-back did not match the new Oura token state");
        }
    } catch (error) {
        const detail = redactSecrets((error as Error).message, [tokens.access_token, tokens.refresh_token]);
        throw new Error(`Oura issued new tokens, but chronixd could not store them safely; restart authorization (${detail})`);
    }
    log(`Saved new Oura OAuth tokens to 1Password item '${config.oura_1password_item}' with refresh_status=ready`);
};
