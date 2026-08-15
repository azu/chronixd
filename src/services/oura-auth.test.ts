import { describe, expect, mock, test } from "bun:test";
import type { OnePasswordCommandRunner } from "./oura-onepassword.js";
import {
    authorizeOura,
    createOuraAuthorizationUrl,
    parseOuraAuthorizationRedirect,
    startOuraLoopbackCallbackServer,
    type OuraAuthorizationFetch,
} from "./oura-auth.js";
import type { OuraEnv } from "./oura.js";

const baseEnv: OuraEnv = {
    name: "ring",
    oura_1password_vault: "chronixd",
    oura_1password_item: "oura-oauth",
    oura_client_id: "client-id",
    oura_client_secret: "client-secret",
    oura_redirect_uri: "http://localhost:64321/oauth/callback",
};

const createTokenStore = (status = "uncertain:previous-attempt") => {
    let item = {
        id: "item-id",
        title: "oura-oauth",
        category: "SECURE_NOTE",
        fields: [
            { id: "access_token", label: "access_token", type: "CONCEALED", value: "old-access-token" },
            { id: "refresh_token", label: "refresh_token", type: "CONCEALED", value: "old-refresh-token" },
            { id: "expires_at", label: "expires_at", type: "STRING", value: "" },
            { id: "refresh_status", label: "refresh_status", type: "STRING", value: status },
        ],
    };
    const edits: string[] = [];
    let reads = 0;
    const runner: OnePasswordCommandRunner = async (args, standardInput) => {
        if (args[1] === "get") {
            reads += 1;
            return JSON.stringify(item);
        }
        if (args[1] === "edit" && standardInput) {
            edits.push(standardInput);
            item = JSON.parse(standardInput);
            return JSON.stringify(item);
        }
        throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    return {
        edits,
        getReads: () => reads,
        getField: (label: string): unknown => item.fields.find((field) => field.label === label)?.value,
        runner,
    };
};

describe("Oura authorization", () => {
    test("creates an encoded authorization URL with state and the daily scope", () => {
        const url = new URL(createOuraAuthorizationUrl(baseEnv, "state-value"));

        expect(url.origin + url.pathname).toBe("https://cloud.ouraring.com/oauth/authorize");
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("client_id")).toBe("client-id");
        expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:64321/oauth/callback");
        expect(url.searchParams.get("scope")).toBe("daily");
        expect(url.searchParams.get("state")).toBe("state-value");
    });

    test("parses a matching redirect", () => {
        const code = parseOuraAuthorizationRedirect(
            "http://localhost:64321/oauth/callback?code=authorization-code&scope=daily&state=state-value",
            "state-value",
            "http://localhost:64321/oauth/callback",
        );

        expect(code).toBe("authorization-code");
    });

    test("accepts an Oura redirect that omits the scope parameter", () => {
        const code = parseOuraAuthorizationRedirect(
            "http://localhost:64321/oauth/callback?iss=https%3A%2F%2Fmoi.ouraring.com%2Foauth%2Fv2%2Fext%2Foauth-anonymous&code=authorization-code&state=state-value",
            "state-value",
            "http://localhost:64321/oauth/callback",
        );

        expect(code).toBe("authorization-code");
    });

    test("rejects a state mismatch before accepting a code", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "http://localhost:64321/oauth/callback?code=authorization-code&scope=daily&state=other",
            "state-value",
            "http://localhost:64321/oauth/callback",
        )).toThrow("state did not match");
    });

    test("rejects a redirect target mismatch", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "https://attacker.example/callback?code=authorization-code&scope=daily&state=state-value",
            "state-value",
            "http://localhost:64321/oauth/callback",
        )).toThrow("does not match oura_redirect_uri");
    });

    test("reports denied access without exchanging a code", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "http://localhost:64321/oauth/callback?error=access_denied&state=state-value",
            "state-value",
            "http://localhost:64321/oauth/callback",
        )).toThrow("access_denied");
    });

    test("requires the daily scope", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "http://localhost:64321/oauth/callback?code=authorization-code&scope=personal&state=state-value",
            "state-value",
            "http://localhost:64321/oauth/callback",
        )).toThrow("required 'daily' scope");
    });

    test("exchanges the code once and replaces an uncertain token state", async () => {
        const store = createTokenStore();
        const opened: string[] = [];
        const callbackEvents: string[] = [];
        const logs: string[] = [];
        const fetchMock = mock(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            expect(String(input)).toBe("https://api.ouraring.com/oauth/token");
            expect(init?.method).toBe("POST");
            expect(init?.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
            const body = init?.body as URLSearchParams;
            expect(body.get("grant_type")).toBe("authorization_code");
            expect(body.get("code")).toBe("authorization-code");
            expect(body.get("redirect_uri")).toBe("http://localhost:64321/oauth/callback");
            expect(body.get("client_id")).toBe("client-id");
            expect(body.get("client_secret")).toBe("client-secret");
            return Response.json({
                access_token: "new-access-token",
                refresh_token: "new-refresh-token",
                expires_in: 3600,
            });
        });

        await authorizeOura(baseEnv, {
            createState: () => "state-value",
            openUrl: async (url) => {
                callbackEvents.push("open-browser");
                opened.push(url);
            },
            startCallbackServer: async (redirectUri, state) => {
                callbackEvents.push("start-server");
                expect(redirectUri).toBe("http://localhost:64321/oauth/callback");
                expect(state).toBe("state-value");
                return {
                    redirectUri,
                    code: Promise.resolve("authorization-code"),
                    close: async () => { callbackEvents.push("close-server"); },
                };
            },
            fetch: fetchMock,
            onePasswordCommandRunner: store.runner,
            now: () => 1_000,
            log: (message) => logs.push(message),
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(opened).toHaveLength(1);
        expect(callbackEvents).toEqual(["start-server", "open-browser", "close-server"]);
        expect(store.edits).toHaveLength(1);
        expect(store.getField("access_token")).toBe("new-access-token");
        expect(store.getField("refresh_token")).toBe("new-refresh-token");
        expect(store.getField("expires_at")).toBe("3601000");
        expect(store.getField("refresh_status")).toBe("ready");
        expect(store.getReads()).toBe(1);
        expect(logs.join("\n")).not.toContain("new-access-token");
        expect(logs.join("\n")).not.toContain("new-refresh-token");
    });

    test("does not write tokens after a failed token exchange and redacts credentials", async () => {
        const store = createTokenStore();
        let error: Error | undefined;
        try {
            await authorizeOura(baseEnv, {
                createState: () => "state-value",
                openUrl: async () => {},
                startCallbackServer: async (redirectUri) => ({
                    redirectUri,
                    code: Promise.resolve("authorization-code"),
                    close: async () => {},
                }),
                fetch: async () => new Response(JSON.stringify({
                    error_description: "authorization-code is invalid for client-secret",
                }), { status: 400, statusText: "Bad Request" }),
                onePasswordCommandRunner: store.runner,
                log: () => {},
            });
        } catch (caught) {
            error = caught as Error;
        }

        expect(error?.message).toContain("Oura token exchange failed: 400 Bad Request");
        expect(error?.message).not.toContain("authorization-code");
        expect(error?.message).not.toContain("client-secret");
        expect(store.edits).toHaveLength(0);
        expect(store.getField("refresh_status")).toBe("uncertain:previous-attempt");
    });

    test("does not retry an exchange with an unknown network outcome", async () => {
        const store = createTokenStore();
        const fetchMock = mock(async () => {
            throw new Error("connection closed after sending authorization-code");
        });

        await expect(authorizeOura(baseEnv, {
            createState: () => "state-value",
            openUrl: async () => {},
            startCallbackServer: async (redirectUri) => ({
                redirectUri,
                code: Promise.resolve("authorization-code"),
                close: async () => {},
            }),
            fetch: fetchMock as OuraAuthorizationFetch,
            onePasswordCommandRunner: store.runner,
            log: () => {},
        })).rejects.toThrow("outcome is unknown; restart authorization");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(store.edits).toHaveLength(0);
    });

    test("requires a configured redirect URI before opening a browser", async () => {
        const openUrl = mock(async () => {});

        await expect(authorizeOura({ ...baseEnv, oura_redirect_uri: undefined }, {
            openUrl,
            log: () => {},
        })).rejects.toThrow("requires oura_redirect_uri");

        expect(openUrl).not.toHaveBeenCalled();
    });

    test("requires a loopback redirect URI before opening a browser", async () => {
        const openUrl = mock(async () => {});

        await expect(authorizeOura({ ...baseEnv, oura_redirect_uri: "https://example.com/callback" }, {
            openUrl,
            log: () => {},
        })).rejects.toThrow("must be an HTTP loopback URL");

        expect(openUrl).not.toHaveBeenCalled();
    });

    test("rejects port zero in the configured redirect URI", async () => {
        await expect(authorizeOura({ ...baseEnv, oura_redirect_uri: "http://localhost:0/oauth/callback" }, {
            log: () => {},
        })).rejects.toThrow("must be an HTTP loopback URL");
    });

    test("receives a valid authorization callback on a temporary loopback server", async () => {
        const callback = await startOuraLoopbackCallbackServer(
            "http://localhost:0/oauth/callback",
            "state-value",
            1_000,
        );

        try {
            const response = await fetch(`${callback.redirectUri}?code=authorization-code&scope=daily&state=state-value`);
            expect(response.status).toBe(200);
            expect(await callback.code).toBe("authorization-code");
        } finally {
            await callback.close();
        }
    });

    test("ignores a callback with a mismatched state and keeps waiting", async () => {
        const callback = await startOuraLoopbackCallbackServer(
            "http://localhost:0/oauth/callback",
            "state-value",
            1_000,
        );

        try {
            const rejected = await fetch(`${callback.redirectUri}?code=attacker-code&scope=daily&state=other`);
            expect(rejected.status).toBe(400);
            const accepted = await fetch(`${callback.redirectUri}?code=authorization-code&scope=daily&state=state-value`);
            expect(accepted.status).toBe(200);
            expect(await callback.code).toBe("authorization-code");
        } finally {
            await callback.close();
        }
    });
});
