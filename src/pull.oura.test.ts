import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { runPull } from "./pull.js";

const TEST_DIR = path.join(process.cwd(), ".test-output-oura-pull");
const OUTPUT_DIR = path.join(TEST_DIR, "db");
const TOKEN_CACHE_DIR = path.join(TEST_DIR, "oura-token-cache");

const createResponse = (score: number): Response => {
    return new Response(JSON.stringify({
        data: [{
            id: "activity-1",
            day: "2026-07-10",
            timestamp: "2026-07-10T04:00:00+09:00",
            score,
            steps: 10_234,
            active_calories: 450,
        }],
        next_token: null,
    }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

describe("runPull with Oura", () => {
    let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
    const originalEnvs = process.env.CHRONIXD_ENVS;
    const originalTokenCacheDir = process.env.OURA_TOKEN_CACHE_DIR;

    beforeEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
        process.env.OURA_TOKEN_CACHE_DIR = TOKEN_CACHE_DIR;
        process.env.CHRONIXD_ENVS = JSON.stringify([{
            name: "ring",
            oura_access_token: "test-access-token",
            oura_data_types: ["daily_activity"],
            oura_timezone: "Asia/Tokyo",
        }]);
        delete process.env.CHRONIXD_DRY_RUN;
    });

    afterEach(async () => {
        fetchSpy?.mockRestore();
        fetchSpy = undefined;
        if (originalEnvs === undefined) delete process.env.CHRONIXD_ENVS;
        else process.env.CHRONIXD_ENVS = originalEnvs;
        if (originalTokenCacheDir === undefined) delete process.env.OURA_TOKEN_CACHE_DIR;
        else process.env.OURA_TOKEN_CACHE_DIR = originalTokenCacheDir;
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    test("writes the schema and upserts a later version of the same Oura document", async () => {
        fetchSpy = spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(createResponse(80))
            .mockResolvedValueOnce(createResponse(90));

        const options = { command: "pull" as const, output: OUTPUT_DIR, limit: 1000 };
        await runPull(options);
        await runPull(options);

        const recordPath = path.join(OUTPUT_DIR, "oura", "ring", "2026", "07.ndjson");
        const lines = (await fs.readFile(recordPath, "utf-8")).trim().split("\n");
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0])).toMatchObject({
            type: "Oura",
            id: "activity-1",
            dataType: "daily_activity",
            score: 90,
        });

        const schema = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, "schema.json"), "utf-8"));
        expect(schema.oura.path).toBe("oura/**/*.ndjson");
        expect(schema.oura.columns.dataType.enum).toContain("daily_activity");
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
