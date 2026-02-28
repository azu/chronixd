import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { generateDayPages, generateIndexPage, filterFutureDays } from "./page-generator.js";
import type { DayGroup } from "./reader.js";

const TEST_DIR = path.join(process.cwd(), ".test-output-generate-pages");
// Use a far-future date so filterFutureDays never excludes test data
const TEST_TODAY = "2099-12-31";

const makeDayGroups = (): DayGroup[] => [
    {
        dateKey: "2024-01-02",
        year: 2024,
        month: 1,
        day: 2,
        entries: [
            { type: "Bluesky", unixTimeMs: 1704153600000, text: "New day", url: "https://example.com/3", service: "bluesky", sourceName: "myaccount" },
        ],
    },
    {
        dateKey: "2024-01-01",
        year: 2024,
        month: 1,
        day: 1,
        entries: [
            { type: "Bluesky", unixTimeMs: 1704067200000, text: "Hello 2024", url: "https://example.com/1", service: "bluesky", sourceName: "myaccount" },
            { type: "Microblog", unixTimeMs: 1704067200000, text: "My post", images: [], service: "microblog", sourceName: "posts" },
        ],
    },
];

beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe("filterFutureDays", () => {
    test("filters out future days", () => {
        const dayGroups = makeDayGroups();
        const filtered = filterFutureDays(dayGroups, "2024-01-01");
        expect(filtered.length).toBe(1);
        expect(filtered[0].dateKey).toBe("2024-01-01");
    });

    test("keeps all past days", () => {
        const dayGroups = makeDayGroups();
        const filtered = filterFutureDays(dayGroups, TEST_TODAY);
        expect(filtered.length).toBe(dayGroups.length);
    });
});

describe("generateDayPages", () => {
    test("creates day HTML files", async () => {
        const dayGroups = makeDayGroups();
        await generateDayPages(TEST_DIR, dayGroups, { language: "ja", microblogEndpoint: null, microblogToken: null, today: TEST_TODAY });

        const file1 = await fs.readFile(path.join(TEST_DIR, "2024", "01", "02.html"), "utf-8");
        expect(file1).toContain("<!DOCTYPE html>");
        expect(file1).toContain("2024-01-02");
        expect(file1).toContain('lang="ja"');

        const file2 = await fs.readFile(path.join(TEST_DIR, "2024", "01", "01.html"), "utf-8");
        expect(file2).toContain("2024-01-01");
    });

    test("includes navigation links", async () => {
        const dayGroups = makeDayGroups();
        await generateDayPages(TEST_DIR, dayGroups, { language: "ja", microblogEndpoint: null, microblogToken: null, today: TEST_TODAY });

        const file1 = await fs.readFile(path.join(TEST_DIR, "2024", "01", "02.html"), "utf-8");
        // First day (newest) should have next link but no prev
        expect(file1).toContain("day-nav-disabled");
        expect(file1).toContain("2024-01-01");
    });

    test("includes post form when microblogEndpoint and microblogToken are set", async () => {
        const dayGroups = makeDayGroups();
        await generateDayPages(TEST_DIR, dayGroups, { language: "ja", microblogEndpoint: "https://api.example.com", microblogToken: "test-token", today: TEST_TODAY });

        const file = await fs.readFile(path.join(TEST_DIR, "2024", "01", "01.html"), "utf-8");
        expect(file).toContain("post-form");
        expect(file).toContain("https://api.example.com");
    });

    test("does not include post form when microblogEndpoint is null", async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
        await fs.mkdir(TEST_DIR, { recursive: true });

        const dayGroups = makeDayGroups();
        await generateDayPages(TEST_DIR, dayGroups, { language: "ja", microblogEndpoint: null, microblogToken: null, today: TEST_TODAY });

        const file = await fs.readFile(path.join(TEST_DIR, "2024", "01", "01.html"), "utf-8");
        expect(file).not.toContain("post-form");
    });
});

describe("generateIndexPage", () => {
    test("creates index.html", async () => {
        const dayGroups = makeDayGroups();
        await generateIndexPage(TEST_DIR, dayGroups, { language: "ja", microblogEndpoint: null, microblogToken: null, today: TEST_TODAY });

        const file = await fs.readFile(path.join(TEST_DIR, "index.html"), "utf-8");
        expect(file).toContain("<!DOCTYPE html>");
        expect(file).toContain("Timeline");
        expect(file).toContain("2024-01-01");
        expect(file).toContain("2024-01-02");
    });

    test("shows entry counts per day", async () => {
        const dayGroups = makeDayGroups();
        await generateIndexPage(TEST_DIR, dayGroups, { language: "ja", microblogEndpoint: null, microblogToken: null, today: TEST_TODAY });

        const file = await fs.readFile(path.join(TEST_DIR, "index.html"), "utf-8");
        expect(file).toContain("1 entries");
        expect(file).toContain("2 entries");
    });
});
