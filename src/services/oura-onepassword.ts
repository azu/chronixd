import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export type OuraTokenState = {
    version: 1;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
};

export type OuraOnePasswordConfig = {
    vault: string;
    item: string;
};

export type OnePasswordCommandRunner = (
    args: string[],
    standardInput?: string,
) => Promise<string>;

type OnePasswordField = {
    id?: string;
    label?: string;
    type?: string;
    value?: unknown;
};

type OnePasswordItem = {
    fields?: OnePasswordField[];
    [key: string]: unknown;
};

const ACCESS_TOKEN_FIELD = "access_token";
const REFRESH_TOKEN_FIELD = "refresh_token";
const EXPIRES_AT_FIELD = "expires_at";
const REFRESH_STATUS_FIELD = "refresh_status";
const READY_STATUS = "ready";
const MAX_WRITE_ATTEMPTS = 3;

const REQUIRED_FIELDS = [
    { label: ACCESS_TOKEN_FIELD, type: "CONCEALED" },
    { label: REFRESH_TOKEN_FIELD, type: "CONCEALED" },
    { label: EXPIRES_AT_FIELD, type: "STRING" },
    { label: REFRESH_STATUS_FIELD, type: "STRING" },
] as const;

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === "string" && value.length > 0;
};

const sanitizeCliError = (value: string): string => {
    const serviceAccountToken = process.env.OP_SERVICE_ACCOUNT_TOKEN;
    const withoutAnsi = value.replace(/\x1b\[[0-9;]*m/g, "");
    const redacted = isNonEmptyString(serviceAccountToken)
        ? withoutAnsi.replaceAll(serviceAccountToken, "[REDACTED]")
        : withoutAnsi;
    return redacted.trim().slice(0, 500);
};

export const runOnePasswordCommand: OnePasswordCommandRunner = (args, standardInput) => {
    return new Promise((resolve, reject) => {
        const child = spawn("op", args, {
            env: process.env,
            stdio: ["pipe", "pipe", "pipe"],
        });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];

        child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
        child.once("error", (error) => {
            reject(new Error(`Failed to start 1Password CLI: ${error.message}`));
        });
        child.once("close", (code) => {
            if (code === 0) {
                resolve(Buffer.concat(stdout).toString("utf-8"));
                return;
            }
            const detail = sanitizeCliError(Buffer.concat(stderr).toString("utf-8"));
            reject(new Error(`1Password CLI failed with exit code ${String(code)}${detail ? `: ${detail}` : ""}`));
        });

        child.stdin.end(standardInput);
    });
};

const validateConfig = (config: OuraOnePasswordConfig): void => {
    if (!isNonEmptyString(config.vault) || !isNonEmptyString(config.item)) {
        throw new Error("Oura 1Password token store requires a vault and item");
    }
    if (config.vault.startsWith("-") || config.item.startsWith("-")) {
        throw new Error("Oura 1Password vault and item must not begin with '-'");
    }
};

const parseItem = (text: string): OnePasswordItem => {
    let item: OnePasswordItem;
    try {
        item = JSON.parse(text) as OnePasswordItem;
    } catch {
        throw new Error("1Password CLI returned invalid JSON for the Oura OAuth item");
    }
    if (!Array.isArray(item.fields)) {
        throw new Error("The Oura OAuth 1Password item has no fields");
    }
    if (item.category !== "API_CREDENTIAL") {
        throw new Error("The Oura OAuth 1Password item must use the API Credential category");
    }
    for (const required of REQUIRED_FIELDS) {
        const matches = item.fields.filter((field) => field.label === required.label);
        if (matches.length !== 1) {
            throw new Error(`The Oura OAuth 1Password item must contain exactly one '${required.label}' field`);
        }
        if (matches[0].type !== required.type) {
            throw new Error(
                `The Oura OAuth 1Password field '${required.label}' must use the ${required.type} type`,
            );
        }
    }
    return item;
};

const findField = (item: OnePasswordItem, label: string): OnePasswordField => {
    const field = item.fields?.find((candidate) => candidate.label === label);
    if (!field) {
        throw new Error(`The Oura OAuth 1Password item is missing the '${label}' field`);
    }
    return field;
};

const getRequiredField = (item: OnePasswordItem, label: string): string => {
    const value = findField(item, label).value;
    if (!isNonEmptyString(value)) {
        throw new Error(`The Oura OAuth 1Password field '${label}' is empty`);
    }
    return value;
};

const getItem = async (
    config: OuraOnePasswordConfig,
    runner: OnePasswordCommandRunner,
): Promise<OnePasswordItem> => {
    validateConfig(config);
    const text = await runner([
        "item",
        "get",
        config.item,
        "--vault",
        config.vault,
        "--format=json",
    ]);
    return parseItem(text);
};

const editItem = async (
    config: OuraOnePasswordConfig,
    item: OnePasswordItem,
    runner: OnePasswordCommandRunner,
): Promise<void> => {
    // The complete item is provided over stdin so rotated tokens never appear in
    // argv, shell history, or the process list.
    await runner([
        "item",
        "edit",
        config.item,
        "--vault",
        config.vault,
    ], JSON.stringify(item));
};

export const readOuraOnePasswordTokenState = async (
    config: OuraOnePasswordConfig,
    runner: OnePasswordCommandRunner = runOnePasswordCommand,
): Promise<OuraTokenState> => {
    const item = await getItem(config, runner);
    const status = getRequiredField(item, REFRESH_STATUS_FIELD);
    if (status !== READY_STATUS) {
        throw new Error(
            "A previous Oura OAuth refresh did not complete safely; reauthorize Oura and replace the 1Password token item before retrying",
        );
    }

    const expiresAtValue = findField(item, EXPIRES_AT_FIELD).value;
    let expiresAt: number | undefined;
    if (isNonEmptyString(expiresAtValue)) {
        expiresAt = Number(expiresAtValue);
        if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
            throw new Error("The Oura OAuth 1Password field 'expires_at' is invalid");
        }
    }

    return {
        version: 1,
        accessToken: getRequiredField(item, ACCESS_TOKEN_FIELD),
        refreshToken: getRequiredField(item, REFRESH_TOKEN_FIELD),
        expiresAt,
    };
};

export const markOuraOnePasswordRefreshUncertain = async (
    config: OuraOnePasswordConfig,
    runner: OnePasswordCommandRunner = runOnePasswordCommand,
): Promise<void> => {
    const item = await getItem(config, runner);
    const status = getRequiredField(item, REFRESH_STATUS_FIELD);
    if (status !== READY_STATUS) {
        throw new Error(
            "A previous Oura OAuth refresh did not complete safely; reauthorize Oura and replace the 1Password token item before retrying",
        );
    }
    const marker = `uncertain:${randomUUID()}:${new Date().toISOString()}`;
    findField(item, REFRESH_STATUS_FIELD).value = marker;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        try {
            await editItem(config, item, runner);
            return;
        } catch (error) {
            lastError = error;
            // The CLI response can be lost after 1Password commits the edit. Only
            // continue when a read-back proves that this exact marker was stored.
            try {
                const latestItem = await getItem(config, runner);
                if (getRequiredField(latestItem, REFRESH_STATUS_FIELD) === marker) return;
            } catch {
                // Retry the same idempotent item update below.
            }
        }
    }
    throw lastError ?? new Error("Failed to mark the Oura OAuth refresh in 1Password");
};

export const writeOuraOnePasswordTokenState = async (
    config: OuraOnePasswordConfig,
    state: OuraTokenState,
    runner: OnePasswordCommandRunner = runOnePasswordCommand,
): Promise<void> => {
    if (!isNonEmptyString(state.refreshToken)) {
        throw new Error("Refusing to persist an Oura OAuth state without a refresh token");
    }
    const item = await getItem(config, runner);
    findField(item, ACCESS_TOKEN_FIELD).value = state.accessToken;
    findField(item, REFRESH_TOKEN_FIELD).value = state.refreshToken;
    findField(item, EXPIRES_AT_FIELD).value = state.expiresAt === undefined ? "" : String(state.expiresAt);
    findField(item, REFRESH_STATUS_FIELD).value = READY_STATUS;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        try {
            await editItem(config, item, runner);
            return;
        } catch (error) {
            lastError = error;
            // Treat an ambiguous CLI failure as committed only when 1Password now
            // contains the exact rotated state. Otherwise retry this same state;
            // this never repeats the single-use Oura refresh request.
            try {
                const latestState = await readOuraOnePasswordTokenState(config, runner);
                if (
                    latestState.accessToken === state.accessToken
                    && latestState.refreshToken === state.refreshToken
                    && latestState.expiresAt === state.expiresAt
                ) {
                    return;
                }
            } catch {
                // Retry the same idempotent item update below.
            }
        }
    }
    throw lastError ?? new Error("Failed to persist refreshed Oura OAuth tokens in 1Password");
};
