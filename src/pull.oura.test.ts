import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { runPull } from "./pull.js";

const TEST_DIR = path.join(process.cwd(), ".test-output-oura-pull");
const OUTPUT_DIR = path.join(TEST_DIR, "db");
const OP_PATH = path.join(TEST_DIR, "op");

const ONE_PASSWORD_ITEM = JSON.stringify({
    id: "oura-item-id",
    category: "API_CREDENTIAL",
    fields: [
        { id: "access_token", label: "access_token", type: "CONCEALED", value: "test-access-token" },
        { id: "refresh_token", label: "refresh_token", type: "CONCEALED", value: "test-refresh-token" },
        { id: "expires_at", label: "expires_at", type: "STRING", value: "" },
        { id: "refresh_status", label: "refresh_status", type: "STRING", value: "ready" },
    ],
});

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
    const originalDryRun = process.env.CHRONIXD_DRY_RUN;
    const originalPath = process.env.PATH;

    beforeEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
        await fs.mkdir(TEST_DIR, { recursive: true });
        await fs.writeFile(OP_PATH, `#!/bin/sh
if [ "$1" = "item" ] && [ "$2" = "get" ] && [ "$3" = "oura-oauth" ] && [ "$4" = "--vault" ] && [ "$5" = "chronixd" ] && [ "$6" = "--format=json" ]; then
    printf '%s\\n' '${ONE_PASSWORD_ITEM}'
    exit 0
fi
printf '%s\\n' 'unexpected op command' >&2
exit 1
`, { mode: 0o700 });
        process.env.PATH = originalPath === undefined
            ? TEST_DIR
            : `${TEST_DIR}${path.delimiter}${originalPath}`;
        process.env.CHRONIXD_ENVS = JSON.stringify([{
            name: "ring",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
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
        if (originalDryRun === undefined) delete process.env.CHRONIXD_DRY_RUN;
        else process.env.CHRONIXD_DRY_RUN = originalDryRun;
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
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
