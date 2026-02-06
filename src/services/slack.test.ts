import { describe, test, expect } from "bun:test";
import { isSlackEnv, SlackType, tsToUnixTimeMs } from "./slack.js";

describe("isSlackEnv", () => {
    test("returns true for valid SlackEnv", () => {
        const env = {
            slack_token: "xoxp-xxx",
            slack_query: "from:@me",
        };
        expect(isSlackEnv(env)).toBe(true);
    });

    test("returns false when slack_token is missing", () => {
        const env = {
            slack_query: "from:@me",
        };
        expect(isSlackEnv(env)).toBe(false);
    });

    test("returns false when slack_query is missing", () => {
        const env = {
            slack_token: "xoxp-xxx",
        };
        expect(isSlackEnv(env)).toBe(false);
    });

    test("returns false for null", () => {
        expect(isSlackEnv(null)).toBe(false);
    });

    test("returns false for non-object", () => {
        expect(isSlackEnv("string")).toBe(false);
    });
});

describe("SlackType", () => {
    test("is 'Slack'", () => {
        expect(SlackType).toBe("Slack");
    });
});

describe("tsToUnixTimeMs", () => {
    test("converts Slack ts to unix time in milliseconds", () => {
        expect(tsToUnixTimeMs("1234567890.123456")).toBe(1234567890123);
    });

    test("handles ts without fractional part", () => {
        expect(tsToUnixTimeMs("1234567890.000000")).toBe(1234567890000);
    });

    test("handles ts with small fractional part", () => {
        expect(tsToUnixTimeMs("1700000000.001000")).toBe(1700000000001);
    });
});
