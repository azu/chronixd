import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { createCache } from "./cache.js";

let testDir: string;

beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cache-test-"));
});

afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
});

describe("createCache", () => {
    test("write and read items", async () => {
        const cache = createCache<{ id: number }>("test.json", { cacheDir: testDir });
        await cache.write([{ id: 1 }, { id: 2 }]);
        const items = await cache.read();
        expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    });

    test("merge appends items", async () => {
        const cache = createCache<{ id: number }>("test.json", { cacheDir: testDir });
        await cache.write([{ id: 1 }]);
        await cache.merge([{ id: 2 }]);
        const items = await cache.read();
        expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    });

    test("read returns empty array when file does not exist", async () => {
        const cache = createCache<{ id: number }>("nonexistent.json", { cacheDir: testDir });
        const items = await cache.read();
        expect(items).toEqual([]);
    });

    describe("maxItems", () => {
        test("trims items to maxItems on write", async () => {
            const cache = createCache<{ id: number }>("test.json", { maxItems: 3, cacheDir: testDir });
            await cache.write([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
            const items = await cache.read();
            expect(items).toEqual([{ id: 3 }, { id: 4 }, { id: 5 }]);
        });

        test("keeps all items when under maxItems", async () => {
            const cache = createCache<{ id: number }>("test.json", { maxItems: 10, cacheDir: testDir });
            await cache.write([{ id: 1 }, { id: 2 }]);
            const items = await cache.read();
            expect(items).toEqual([{ id: 1 }, { id: 2 }]);
        });

        test("trims items on merge", async () => {
            const cache = createCache<{ id: number }>("test.json", { maxItems: 3, cacheDir: testDir });
            await cache.write([{ id: 1 }, { id: 2 }]);
            await cache.merge([{ id: 3 }, { id: 4 }]);
            const items = await cache.read();
            expect(items).toEqual([{ id: 2 }, { id: 3 }, { id: 4 }]);
        });

        test("no trimming when maxItems is not set", async () => {
            const cache = createCache<{ id: number }>("test.json", { cacheDir: testDir });
            const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
            await cache.write(items);
            const result = await cache.read();
            expect(result).toHaveLength(100);
        });
    });
});
