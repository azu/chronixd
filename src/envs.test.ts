import { describe, expect, test } from "bun:test";
import { typeOfEnv } from "./envs.js";

describe('envs', function () {
    test("typeofEnv(env) returns type string of the env", () => {
        const type = typeOfEnv({
            "name": "test",
            "rss_url": "https://rsshub.app/github/repos/azu",
        });
        expect(type).toBe("RSS");
    });

    test("typeOfEnv(env) recognizes Oura", () => {
        const type = typeOfEnv({
            name: "ring",
            oura_access_token: "oauth-access-token",
        });
        expect(type).toBe("Oura");
    });

    test("typeOfEnv(env) recognizes Oura with a 1Password token store", () => {
        const type = typeOfEnv({
            name: "ring",
            oura_token_store: "1password",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
        });
        expect(type).toBe("Oura");
    });
});
