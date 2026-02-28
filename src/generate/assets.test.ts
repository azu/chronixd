import { describe, test, expect, afterAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { copyAssets } from "./assets.js";

const TEST_DIR = path.join(process.cwd(), ".test-output-assets");

afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe("copyAssets", () => {
    test("writes all asset files with non-empty content", async () => {
        await copyAssets(TEST_DIR);

        const assetsDir = path.join(TEST_DIR, "assets");
        const files = await fs.readdir(assetsDir);
        expect(files.sort()).toEqual(["location-map.js", "post-client.js", "style.css"]);

        for (const file of files) {
            const content = await fs.readFile(path.join(assetsDir, file), "utf-8");
            expect(content.length).toBeGreaterThan(0);
        }
    });
});
