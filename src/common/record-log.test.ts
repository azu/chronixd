import { describe, expect, test } from "bun:test";
import { recordForDebugLog } from "./record-log.js";

describe("recordForDebugLog", () => {
    test("redacts Oura health data while keeping diagnostic identity", () => {
        const value = recordForDebugLog({
            type: "Oura",
            unixTimeMs: 1,
            id: "sleep-1",
            dataType: "sleep",
            day: "2026-07-10",
            score: 80,
            rawData: "secret-health-data",
        } as never);

        expect(value).toEqual({
            type: "Oura",
            unixTimeMs: 1,
            id: "sleep-1",
            dataType: "sleep",
            day: "2026-07-10",
            healthData: "[REDACTED]",
        });
    });

    test("leaves other service records unchanged", () => {
        const record = { type: "RSS", unixTimeMs: 1, title: "Example" };
        expect(recordForDebugLog(record)).toBe(record);
    });
});
