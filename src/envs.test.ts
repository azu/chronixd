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
});
