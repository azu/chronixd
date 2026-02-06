import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { readLastRecord } from "./lastItem.js";

const TEST_DIR = path.join(import.meta.dir, "../../.test-output-lastitem");

describe("readLastRecord", () => {
    beforeEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    afterEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    test("returns null when directory does not exist", async () => {
        const result = await readLastRecord({
            outputDir: TEST_DIR,
            name: "my-timeline",
            service: "bluesky",
        });
        expect(result).toBeNull();
    });

    test("reads last record from latest month file", async () => {
        const dir = path.join(TEST_DIR, "bluesky", "my-timeline", "2024");
        await fs.mkdir(dir, { recursive: true });

        const record1 = { type: "Bluesky", unixTimeMs: 1000, text: "first" };
        const record2 = { type: "Bluesky", unixTimeMs: 2000, text: "second" };
        await fs.writeFile(
            path.join(dir, "01.ndjson"),
            `${JSON.stringify(record1)}\n${JSON.stringify(record2)}\n`,
            "utf-8"
        );

        const result = await readLastRecord({
            outputDir: TEST_DIR,
            name: "my-timeline",
            service: "bluesky",
        });
        expect(result).toEqual(record2);
    });

    test("reads from latest year and latest month", async () => {
        const dir2023 = path.join(TEST_DIR, "bluesky", "my-timeline", "2023");
        const dir2024 = path.join(TEST_DIR, "bluesky", "my-timeline", "2024");
        await fs.mkdir(dir2023, { recursive: true });
        await fs.mkdir(dir2024, { recursive: true });

        const oldRecord = { type: "Bluesky", unixTimeMs: 1000 };
        const newRecord = { type: "Bluesky", unixTimeMs: 5000 };
        await fs.writeFile(
            path.join(dir2023, "12.ndjson"),
            `${JSON.stringify(oldRecord)}\n`,
            "utf-8"
        );
        await fs.writeFile(
            path.join(dir2024, "03.ndjson"),
            `${JSON.stringify(newRecord)}\n`,
            "utf-8"
        );

        const result = await readLastRecord({
            outputDir: TEST_DIR,
            name: "my-timeline",
            service: "bluesky",
        });
        expect(result).toEqual(newRecord);
    });

    test("skips empty files and reads from next available", async () => {
        const dir = path.join(TEST_DIR, "bluesky", "my-timeline", "2024");
        await fs.mkdir(dir, { recursive: true });

        const record = { type: "Bluesky", unixTimeMs: 3000 };
        await fs.writeFile(path.join(dir, "03.ndjson"), "", "utf-8");
        await fs.writeFile(
            path.join(dir, "02.ndjson"),
            `${JSON.stringify(record)}\n`,
            "utf-8"
        );

        const result = await readLastRecord({
            outputDir: TEST_DIR,
            name: "my-timeline",
            service: "bluesky",
        });
        expect(result).toEqual(record);
    });
});
