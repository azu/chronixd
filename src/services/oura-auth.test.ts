import { describe, expect, mock, test } from "bun:test";
import type { OnePasswordCommandRunner } from "./oura-onepassword.js";
import {
    authorizeOura,
    createOuraAuthorizationUrl,
    parseOuraAuthorizationRedirect,
    type OuraAuthorizationFetch,
} from "./oura-auth.js";
import type { OuraEnv } from "./oura.js";

const baseEnv: OuraEnv = {
    name: "ring",
    oura_1password_vault: "chronixd",
    oura_1password_item: "oura-oauth",
    oura_client_id: "client-id",
    oura_client_secret: "client-secret",
    oura_redirect_uri: "https://example.com/callback",
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
    const runner: OnePasswordCommandRunner = async (args, standardInput) => {
        if (args[1] === "get") return JSON.stringify(item);
        if (args[1] === "edit" && standardInput) {
            edits.push(standardInput);
            item = JSON.parse(standardInput);
            return "";
        }
        throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    return {
        edits,
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
        expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
        expect(url.searchParams.get("scope")).toBe("daily");
        expect(url.searchParams.get("state")).toBe("state-value");
    });

    test("parses a matching redirect", () => {
        const code = parseOuraAuthorizationRedirect(
            "https://example.com/callback?code=authorization-code&scope=daily&state=state-value",
            "state-value",
            "https://example.com/callback",
        );

        expect(code).toBe("authorization-code");
    });

    test("rejects a state mismatch before accepting a code", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "https://example.com/callback?code=authorization-code&scope=daily&state=other",
            "state-value",
            "https://example.com/callback",
        )).toThrow("state did not match");
    });

    test("rejects a redirect target mismatch", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "https://attacker.example/callback?code=authorization-code&scope=daily&state=state-value",
            "state-value",
            "https://example.com/callback",
        )).toThrow("does not match oura_redirect_uri");
    });

    test("reports denied access without exchanging a code", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "https://example.com/callback?error=access_denied&state=state-value",
            "state-value",
            "https://example.com/callback",
        )).toThrow("access_denied");
    });

    test("requires the daily scope", () => {
        expect(() => parseOuraAuthorizationRedirect(
            "https://example.com/callback?code=authorization-code&scope=personal&state=state-value",
            "state-value",
            "https://example.com/callback",
        )).toThrow("required 'daily' scope");
    });

    test("exchanges the code once and replaces an uncertain token state", async () => {
        const store = createTokenStore();
        const opened: string[] = [];
        const logs: string[] = [];
        const fetchMock = mock(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            expect(String(input)).toBe("https://api.ouraring.com/oauth/token");
            expect(init?.method).toBe("POST");
            expect(init?.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
            const body = init?.body as URLSearchParams;
            expect(body.get("grant_type")).toBe("authorization_code");
            expect(body.get("code")).toBe("authorization-code");
            expect(body.get("redirect_uri")).toBe("https://example.com/callback");
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
            openUrl: async (url) => { opened.push(url); },
            promptForRedirect: async () => "https://example.com/callback?code=authorization-code&scope=daily&state=state-value",
            fetch: fetchMock,
            onePasswordCommandRunner: store.runner,
            now: () => 1_000,
            log: (message) => logs.push(message),
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(opened).toHaveLength(1);
        expect(store.edits).toHaveLength(1);
        expect(store.getField("access_token")).toBe("new-access-token");
        expect(store.getField("refresh_token")).toBe("new-refresh-token");
        expect(store.getField("expires_at")).toBe("3601000");
        expect(store.getField("refresh_status")).toBe("ready");
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
                promptForRedirect: async () => "https://example.com/callback?code=authorization-code&scope=daily&state=state-value",
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
            promptForRedirect: async () => "https://example.com/callback?code=authorization-code&scope=daily&state=state-value",
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
});
