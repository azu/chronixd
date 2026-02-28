import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { readAllRecords, groupByDay } from "./reader.js";

const TEST_DIR = path.join(process.cwd(), ".test-output-generate-reader");

beforeAll(async () => {
    // Create test NDJSON structure: db/bluesky/myaccount/2024/01.ndjson
    const dir = path.join(TEST_DIR, "bluesky", "myaccount", "2024");
    await fs.mkdir(dir, { recursive: true });
    const records = [
        { type: "Bluesky", unixTimeMs: 1704067200000, text: "Hello 2024", url: "https://example.com/1" }, // 2024-01-01 00:00 UTC
        { type: "Bluesky", unixTimeMs: 1704110400000, text: "Hello again", url: "https://example.com/2" }, // 2024-01-01 12:00 UTC
        { type: "Bluesky", unixTimeMs: 1704153600000, text: "New day", url: "https://example.com/3" },   // 2024-01-02 00:00 UTC
    ];
    const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await fs.writeFile(path.join(dir, "01.ndjson"), lines, "utf-8");

    // Create a second service
    const dir2 = path.join(TEST_DIR, "microblog", "posts", "2024");
    await fs.mkdir(dir2, { recursive: true });
    const records2 = [
        { type: "Microblog", unixTimeMs: 1704067200000, text: "My post", images: [] }, // same day as first bluesky
    ];
    const lines2 = records2.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await fs.writeFile(path.join(dir2, "01.ndjson"), lines2, "utf-8");
});

afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe("readAllRecords", () => {
    test("reads all records from nested directories", async () => {
        const records = await readAllRecords(TEST_DIR);
        expect(records.length).toBe(4);
    });

    test("adds service and sourceName metadata", async () => {
        const records = await readAllRecords(TEST_DIR);
        const blueskyRecords = records.filter((r) => r.service === "bluesky");
        expect(blueskyRecords.length).toBe(3);
        expect(blueskyRecords[0].sourceName).toBe("myaccount");
    });

    test("returns empty for non-existent directory", async () => {
        const records = await readAllRecords("/tmp/nonexistent-chronixd-test");
        expect(records.length).toBe(0);
    });
});

describe("groupByDay", () => {
    test("groups records by UTC day", async () => {
        const records = await readAllRecords(TEST_DIR);
        const groups = groupByDay(records);

        // Should have 2 days: 2024-01-01 (3 records) and 2024-01-02 (1 record)
        expect(groups.length).toBe(2);
    });

    test("sorts day groups by date descending", async () => {
        const records = await readAllRecords(TEST_DIR);
        const groups = groupByDay(records);

        expect(groups[0].dateKey).toBe("2024-01-02");
        expect(groups[1].dateKey).toBe("2024-01-01");
    });

    test("sorts entries within a day by time descending", async () => {
        const records = await readAllRecords(TEST_DIR);
        const groups = groupByDay(records);

        const jan1 = groups.find((g) => g.dateKey === "2024-01-01");
        expect(jan1).toBeTruthy();
        expect(jan1!.entries.length).toBe(3);
        // First entry should be the latest (12:00 UTC)
        expect(jan1!.entries[0].unixTimeMs).toBe(1704110400000);
    });

    test("populates year, month, day fields", async () => {
        const records = await readAllRecords(TEST_DIR);
        const groups = groupByDay(records);

        const jan2 = groups.find((g) => g.dateKey === "2024-01-02");
        expect(jan2).toBeTruthy();
        expect(jan2!.year).toBe(2024);
        expect(jan2!.month).toBe(1);
        expect(jan2!.day).toBe(2);
    });
});
