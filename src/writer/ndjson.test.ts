import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { appendRecords } from "./ndjson.js";
import { BaseRecord } from "../common/types.js";

const TEST_DIR = path.join(import.meta.dir, "../../.test-output-ndjson");

describe("appendRecords", () => {
    beforeEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    afterEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    test("writes records to correct year/month file", async () => {
        const records: BaseRecord[] = [
            { type: "test", unixTimeMs: new Date("2024-03-15T10:00:00Z").getTime() },
            { type: "test", unixTimeMs: new Date("2024-03-20T12:00:00Z").getTime() },
        ];

        await appendRecords(
            { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" },
            records
        );

        const filePath = path.join(TEST_DIR, "my-timeline", "test-service", "2024", "03.ndjson");
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n");
        expect(lines.length).toBe(2);
        expect(JSON.parse(lines[0]).unixTimeMs).toBe(records[0].unixTimeMs);
        expect(JSON.parse(lines[1]).unixTimeMs).toBe(records[1].unixTimeMs);
    });

    test("splits records across month boundaries", async () => {
        const records: BaseRecord[] = [
            { type: "test", unixTimeMs: new Date("2024-01-31T23:00:00Z").getTime() },
            { type: "test", unixTimeMs: new Date("2024-02-01T01:00:00Z").getTime() },
        ];

        await appendRecords(
            { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" },
            records
        );

        const janFile = path.join(TEST_DIR, "my-timeline", "test-service", "2024", "01.ndjson");
        const febFile = path.join(TEST_DIR, "my-timeline", "test-service", "2024", "02.ndjson");
        const janContent = await fs.readFile(janFile, "utf-8");
        const febContent = await fs.readFile(febFile, "utf-8");
        expect(janContent.trimEnd().split("\n").length).toBe(1);
        expect(febContent.trimEnd().split("\n").length).toBe(1);
    });

    test("appends to existing file", async () => {
        const options = { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" };
        const records1: BaseRecord[] = [
            { type: "test", unixTimeMs: new Date("2024-06-10T10:00:00Z").getTime() },
        ];
        const records2: BaseRecord[] = [
            { type: "test", unixTimeMs: new Date("2024-06-15T10:00:00Z").getTime() },
        ];

        await appendRecords(options, records1);
        await appendRecords(options, records2);

        const filePath = path.join(TEST_DIR, "my-timeline", "test-service", "2024", "06.ndjson");
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n");
        expect(lines.length).toBe(2);
    });

    test("does nothing for empty records", async () => {
        await appendRecords(
            { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" },
            []
        );

        const dirExists = await fs.access(path.join(TEST_DIR, "my-timeline")).then(() => true).catch(() => false);
        expect(dirExists).toBe(false);
    });

    test("sorts records by unixTimeMs ascending", async () => {
        const records: BaseRecord[] = [
            { type: "test", unixTimeMs: new Date("2024-05-20T10:00:00Z").getTime() },
            { type: "test", unixTimeMs: new Date("2024-05-10T10:00:00Z").getTime() },
            { type: "test", unixTimeMs: new Date("2024-05-15T10:00:00Z").getTime() },
        ];

        await appendRecords(
            { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" },
            records
        );

        const filePath = path.join(TEST_DIR, "my-timeline", "test-service", "2024", "05.ndjson");
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines[0].unixTimeMs).toBeLessThan(lines[1].unixTimeMs);
        expect(lines[1].unixTimeMs).toBeLessThan(lines[2].unixTimeMs);
    });

    test("dry run does not create files", async () => {
        const prev = process.env.CHRONIXD_DRY_RUN;
        process.env.CHRONIXD_DRY_RUN = "true";
        try {
            const records: BaseRecord[] = [
                { type: "test", unixTimeMs: new Date("2024-07-01T10:00:00Z").getTime() },
            ];
            await appendRecords(
                { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" },
                records
            );
            const dirExists = await fs.access(path.join(TEST_DIR, "my-timeline")).then(() => true).catch(() => false);
            expect(dirExists).toBe(false);
        } finally {
            if (prev === undefined) {
                delete process.env.CHRONIXD_DRY_RUN;
            } else {
                process.env.CHRONIXD_DRY_RUN = prev;
            }
        }
    });
});
