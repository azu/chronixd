import { describe, expect, test } from "bun:test";
import { initDateContext } from "../date-context.js";
import type { TimelineEntry } from "../reader.js";
import { ouraView } from "./oura.js";

initDateContext({ timezone: "UTC" });

describe("ouraView", () => {
    test("renders daily activity metrics", () => {
        const entry: TimelineEntry = {
            type: "Oura",
            service: "oura",
            sourceName: "ring",
            unixTimeMs: new Date("2026-07-10T04:00:00Z").getTime(),
            dataType: "daily_activity",
            score: 82,
            steps: 10_234,
            activeCalories: 450,
        };

        const [result] = ouraView.render([entry]);
        const html = String(result.html);
        expect(html).toContain("Activity: 82");
        expect(html).toContain("10,234 steps");
        expect(html).toContain("450 active kcal");
    });

    test("renders a detailed sleep time range and biometrics", () => {
        const entry: TimelineEntry = {
            type: "Oura",
            service: "oura",
            sourceName: "ring",
            unixTimeMs: new Date("2026-07-10T07:30:00Z").getTime(),
            dataType: "sleep",
            bedtimeStart: "2026-07-09T23:30:00Z",
            bedtimeEnd: "2026-07-10T07:30:00Z",
            durationSeconds: 27_000,
            averageHeartRate: 54.5,
            averageHrv: 48,
        };

        const [result] = ouraView.render([entry]);
        const html = String(result.html);
        expect(html).toContain("23:30 - 07:30");
        expect(html).toContain("Sleep: 7h 30m");
        expect(html).toContain("avg HR 55 bpm");
        expect(html).toContain("avg HRV 48 ms");
    });

    test("does not present deleted or rejected rest periods as normal sleep", () => {
        const base: TimelineEntry = {
            type: "Oura",
            service: "oura",
            sourceName: "ring",
            unixTimeMs: new Date("2026-07-10T07:30:00Z").getTime(),
            dataType: "sleep",
            durationSeconds: 3600,
        };

        const deletedHtml = String(ouraView.render([{ ...base, sleepType: "deleted" }])[0].html);
        const restHtml = String(ouraView.render([{ ...base, sleepType: "rest" }])[0].html);
        expect(deletedHtml).toContain("Deleted sleep record");
        expect(deletedHtml).not.toContain("1h 0m");
        expect(restHtml).toContain("Rest (not sleep): 1h 0m");
    });

    test("carries rounded minutes into the next hour", () => {
        const entry: TimelineEntry = {
            type: "Oura",
            service: "oura",
            sourceName: "ring",
            unixTimeMs: new Date("2026-07-10T07:30:00Z").getTime(),
            dataType: "sleep",
            durationSeconds: 7170,
        };

        const html = String(ouraView.render([entry])[0].html);
        expect(html).toContain("Sleep: 2h 0m");
        expect(html).not.toContain("1h 60m");
    });
});
