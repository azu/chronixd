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

    test("typeOfEnv(env) recognizes Oura with its 1Password and OAuth configuration", () => {
        const type = typeOfEnv({
            name: "ring",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        });
        expect(type).toBe("Oura");
    });
});
