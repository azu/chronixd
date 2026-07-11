import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { appendRecords, replaceRecords, upsertRecords } from "./ndjson.js";
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

        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
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

        const janFile = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "01.ndjson");
        const febFile = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "02.ndjson");
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

        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "06.ndjson");
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n");
        expect(lines.length).toBe(2);
    });

    test("does nothing for empty records", async () => {
        await appendRecords(
            { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" },
            []
        );

        await expect(fs.access(path.join(TEST_DIR, "my-timeline"))).rejects.toThrow();
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

        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "05.ndjson");
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines[0].unixTimeMs).toBeLessThan(lines[1].unixTimeMs);
        expect(lines[1].unixTimeMs).toBeLessThan(lines[2].unixTimeMs);
    });

    test("dry run does not create files", async () => {
        const records: BaseRecord[] = [
            { type: "test", unixTimeMs: new Date("2024-07-01T10:00:00Z").getTime() },
        ];
        await appendRecords(
            { outputDir: TEST_DIR, name: "my-timeline", service: "test-service", dryRun: true },
            records
        );
        await expect(fs.access(path.join(TEST_DIR, "my-timeline"))).rejects.toThrow();
    });
});

describe("replaceRecords", () => {
    const options = { outputDir: TEST_DIR, name: "my-timeline", service: "test-service" };

    beforeEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    afterEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    test("writes records to new file when no existing data", async () => {
        const sinceUnixTimeMs = new Date("2024-03-01T00:00:00Z").getTime();
        const records: BaseRecord[] = [
            { type: "calendar", unixTimeMs: new Date("2024-03-10T10:00:00Z").getTime() },
            { type: "calendar", unixTimeMs: new Date("2024-03-20T10:00:00Z").getTime() },
        ];

        await replaceRecords(options, records, { type: "calendar", sinceUnixTimeMs });

        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n");
        expect(lines.length).toBe(2);
        expect(JSON.parse(lines[0]).unixTimeMs).toBe(records[0].unixTimeMs);
        expect(JSON.parse(lines[1]).unixTimeMs).toBe(records[1].unixTimeMs);
    });

    test("replaces matching records and keeps others", async () => {
        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const existing = [
            { type: "GitHub", unixTimeMs: new Date("2024-03-05T10:00:00Z").getTime() },
            { type: "calendar", unixTimeMs: new Date("2024-03-10T10:00:00Z").getTime(), summary: "old event" },
            { type: "calendar", unixTimeMs: new Date("2024-03-15T10:00:00Z").getTime(), summary: "deleted event" },
        ];
        await fs.writeFile(filePath, existing.map(r => JSON.stringify(r)).join("\n") + "\n", "utf-8");

        const sinceUnixTimeMs = new Date("2024-03-08T00:00:00Z").getTime();
        const newRecords: BaseRecord[] = [
            { type: "calendar", unixTimeMs: new Date("2024-03-10T10:00:00Z").getTime() },
        ];

        await replaceRecords(options, newRecords, { type: "calendar", sinceUnixTimeMs });

        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines.length).toBe(2);
        expect(lines[0].type).toBe("GitHub");
        expect(lines[1].type).toBe("calendar");
        expect(lines[1].unixTimeMs).toBe(newRecords[0].unixTimeMs);
    });

    test("removes deleted events when records is empty", async () => {
        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const existing = [
            { type: "GitHub", unixTimeMs: new Date("2024-03-05T10:00:00Z").getTime() },
            { type: "calendar", unixTimeMs: new Date("2024-03-10T10:00:00Z").getTime() },
        ];
        await fs.writeFile(filePath, existing.map(r => JSON.stringify(r)).join("\n") + "\n", "utf-8");

        const sinceUnixTimeMs = new Date("2024-03-01T00:00:00Z").getTime();
        await replaceRecords(options, [], { type: "calendar", sinceUnixTimeMs });

        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines.length).toBe(1);
        expect(lines[0].type).toBe("GitHub");
    });

    test("handles records spanning multiple months", async () => {
        const sinceUnixTimeMs = new Date("2024-03-15T00:00:00Z").getTime();
        const records: BaseRecord[] = [
            { type: "calendar", unixTimeMs: new Date("2024-03-20T10:00:00Z").getTime() },
            { type: "calendar", unixTimeMs: new Date("2024-04-05T10:00:00Z").getTime() },
        ];

        await replaceRecords(options, records, { type: "calendar", sinceUnixTimeMs });

        const marFile = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        const aprFile = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "04.ndjson");
        const marContent = await fs.readFile(marFile, "utf-8");
        const aprContent = await fs.readFile(aprFile, "utf-8");
        expect(marContent.trimEnd().split("\n").length).toBe(1);
        expect(aprContent.trimEnd().split("\n").length).toBe(1);
    });

    test("preserves records before sinceUnixTimeMs of same type", async () => {
        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const existing = [
            { type: "calendar", unixTimeMs: new Date("2024-03-01T10:00:00Z").getTime(), summary: "past event" },
            { type: "calendar", unixTimeMs: new Date("2024-03-15T10:00:00Z").getTime(), summary: "future event" },
        ];
        await fs.writeFile(filePath, existing.map(r => JSON.stringify(r)).join("\n") + "\n", "utf-8");

        const sinceUnixTimeMs = new Date("2024-03-10T00:00:00Z").getTime();
        const newRecords: BaseRecord[] = [
            { type: "calendar", unixTimeMs: new Date("2024-03-20T10:00:00Z").getTime() },
        ];

        await replaceRecords(options, newRecords, { type: "calendar", sinceUnixTimeMs });

        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines.length).toBe(2);
        expect(lines[0].unixTimeMs).toBe(existing[0].unixTimeMs);
        expect(lines[1].unixTimeMs).toBe(newRecords[0].unixTimeMs);
    });

    test("sorts merged records by unixTimeMs", async () => {
        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const existing = [
            { type: "GitHub", unixTimeMs: new Date("2024-03-20T10:00:00Z").getTime() },
        ];
        await fs.writeFile(filePath, existing.map(r => JSON.stringify(r)).join("\n") + "\n", "utf-8");

        const sinceUnixTimeMs = new Date("2024-03-01T00:00:00Z").getTime();
        const newRecords: BaseRecord[] = [
            { type: "calendar", unixTimeMs: new Date("2024-03-10T10:00:00Z").getTime() },
        ];

        await replaceRecords(options, newRecords, { type: "calendar", sinceUnixTimeMs });

        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines.length).toBe(2);
        expect(lines[0].type).toBe("calendar");
        expect(lines[1].type).toBe("GitHub");
    });

    test("dry run does not modify files", async () => {
        const filePath = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const existing = [
            { type: "calendar", unixTimeMs: new Date("2024-03-10T10:00:00Z").getTime() },
        ];
        const originalContent = existing.map(r => JSON.stringify(r)).join("\n") + "\n";
        await fs.writeFile(filePath, originalContent, "utf-8");

        const sinceUnixTimeMs = new Date("2024-03-01T00:00:00Z").getTime();
        await replaceRecords({ ...options, dryRun: true }, [], { type: "calendar", sinceUnixTimeMs });

        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toBe(originalContent);
    });

    test("clamps records with unixTimeMs before sinceUnixTimeMs into the sinceUnixTimeMs month", async () => {
        // JST 2024-04-01 08:00 = UTC 2024-03-31 23:00
        // ソース側(JST)では4月だが、UTC月では3月になるレコード
        const sinceUnixTimeMs = new Date("2024-04-01T00:00:00Z").getTime();
        const recordBeforeSince: BaseRecord = {
            type: "Bookmark",
            unixTimeMs: new Date("2024-03-31T23:00:00Z").getTime(),
        };
        const recordInApril: BaseRecord = {
            type: "Bookmark",
            unixTimeMs: new Date("2024-04-15T10:00:00Z").getTime(),
        };

        await replaceRecords(options, [recordBeforeSince, recordInApril], {
            type: "Bookmark",
            sinceUnixTimeMs,
        });

        // クランプにより、3月UTCのレコードが4月ファイルに配置される
        const aprFile = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "04.ndjson");
        const aprContent = await fs.readFile(aprFile, "utf-8");
        const aprLines = aprContent.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(aprLines.length).toBe(2);
        expect(aprLines[0].unixTimeMs).toBe(recordBeforeSince.unixTimeMs);
        expect(aprLines[1].unixTimeMs).toBe(recordInApril.unixTimeMs);

        // 3月ファイルは作成されない
        const marFile = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "03.ndjson");
        await expect(fs.access(marFile)).rejects.toThrow();
    });

    test("no duplicates when re-running with existing clamped record", async () => {
        // 初回実行: sinceUnixTimeMs以前のレコードがクランプされて4月ファイルに保存
        const sinceUnixTimeMs = new Date("2024-04-01T00:00:00Z").getTime();
        const recordBeforeSince: BaseRecord = {
            type: "Bookmark",
            unixTimeMs: new Date("2024-03-31T23:00:00Z").getTime(),
        };
        const recordInApril: BaseRecord = {
            type: "Bookmark",
            unixTimeMs: new Date("2024-04-10T10:00:00Z").getTime(),
        };

        await replaceRecords(options, [recordBeforeSince, recordInApril], {
            type: "Bookmark",
            sinceUnixTimeMs,
        });

        // 2回目実行: 同じデータで再実行 → 重複しない
        await replaceRecords(options, [recordBeforeSince, recordInApril], {
            type: "Bookmark",
            sinceUnixTimeMs,
        });

        const aprFile = path.join(TEST_DIR, "test-service", "my-timeline", "2024", "04.ndjson");
        const content = await fs.readFile(aprFile, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines.length).toBe(2);
        expect(lines[0].unixTimeMs).toBe(recordBeforeSince.unixTimeMs);
        expect(lines[1].unixTimeMs).toBe(recordInApril.unixTimeMs);
    });
});

describe("upsertRecords", () => {
    const options = { outputDir: TEST_DIR, name: "my-timeline", service: "notion" };
    const getPageId = (record: BaseRecord) => (record as BaseRecord & { pageId?: string }).pageId;

    beforeEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    afterEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    test("replaces an existing record with the same key across month files", async () => {
        const janFile = path.join(TEST_DIR, "notion", "my-timeline", "2024", "01.ndjson");
        await fs.mkdir(path.dirname(janFile), { recursive: true });
        const existing = [
            {
                type: "Notion",
                pageId: "page-1",
                unixTimeMs: new Date("2024-01-10T10:00:00Z").getTime(),
                title: "Old",
                properties: { Status: "Todo" },
            },
            {
                type: "Notion",
                pageId: "page-2",
                unixTimeMs: new Date("2024-01-12T10:00:00Z").getTime(),
                title: "Keep",
                properties: { Status: "Todo" },
            },
        ];
        await fs.writeFile(janFile, existing.map(r => JSON.stringify(r)).join("\n") + "\n", "utf-8");

        const updated = {
            type: "Notion",
            pageId: "page-1",
            unixTimeMs: new Date("2024-02-01T10:00:00Z").getTime(),
            title: "Updated",
            properties: { Status: "Done" },
        };
        await upsertRecords(options, [updated], getPageId);

        const janContent = await fs.readFile(janFile, "utf-8");
        const janLines = janContent.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(janLines.length).toBe(1);
        expect(janLines[0].pageId).toBe("page-2");

        const febFile = path.join(TEST_DIR, "notion", "my-timeline", "2024", "02.ndjson");
        const febContent = await fs.readFile(febFile, "utf-8");
        const febLines = febContent.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(febLines.length).toBe(1);
        expect(febLines[0].pageId).toBe("page-1");
        expect(febLines[0].properties.Status).toBe("Done");
    });

    test("keeps only the latest incoming record for the same key", async () => {
        const records = [
            {
                type: "Notion",
                pageId: "page-1",
                unixTimeMs: new Date("2024-03-01T10:00:00Z").getTime(),
                title: "Older",
                properties: { Status: "Doing" },
            },
            {
                type: "Notion",
                pageId: "page-1",
                unixTimeMs: new Date("2024-03-02T10:00:00Z").getTime(),
                title: "Newer",
                properties: { Status: "Done" },
            },
        ];
        await upsertRecords(options, records, getPageId);

        const filePath = path.join(TEST_DIR, "notion", "my-timeline", "2024", "03.ndjson");
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.trimEnd().split("\n").map(l => JSON.parse(l));
        expect(lines.length).toBe(1);
        expect(lines[0].title).toBe("Newer");
        expect(lines[0].properties.Status).toBe("Done");
    });

    test("fails without deleting an existing file that contains invalid NDJSON", async () => {
        const invalidFile = path.join(TEST_DIR, "notion", "my-timeline", "2025", "01.ndjson");
        await fs.mkdir(path.dirname(invalidFile), { recursive: true });
        const invalidContent = "{bad json}\n";
        await fs.writeFile(invalidFile, invalidContent, "utf-8");
        const newRecord = {
            type: "Notion",
            pageId: "page-new",
            unixTimeMs: new Date("2026-01-02T10:00:00Z").getTime(),
            title: "New",
            properties: {},
        };

        await expect(upsertRecords(options, [newRecord], getPageId)).rejects.toThrow(
            "Invalid NDJSON",
        );
        expect(await fs.readFile(invalidFile, "utf-8")).toBe(invalidContent);

        const newFile = path.join(TEST_DIR, "notion", "my-timeline", "2026", "01.ndjson");
        await expect(fs.access(newFile)).rejects.toThrow();
    });
});
