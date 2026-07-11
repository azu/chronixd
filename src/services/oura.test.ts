import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import { hostname } from "os";
import { RateLimitError } from "../common/RateLimitError.js";
import type { OnePasswordCommandRunner } from "./oura-onepassword.js";
import {
    convertOuraDocument,
    fetchOura,
    getOuraRecordKey,
    isOuraEnv,
    type OuraEnv,
    OuraType,
} from "./oura.js";

const TEST_CACHE_DIR = path.join(process.cwd(), ".test-output-oura-cache");
const NOW = new Date("2026-07-11T03:00:00Z");

const activityDocument = {
    id: "activity-1",
    day: "2026-07-10",
    timestamp: "2026-07-10T04:00:00+09:00",
    score: 82,
    steps: 10_234,
    active_calories: 450,
    contributors: {},
};

const readinessDocument = {
    id: "readiness-1",
    day: "2026-07-10",
    timestamp: "2026-07-10T00:00:00+09:00",
    score: 77,
    temperature_deviation: -0.2,
    contributors: {},
};

const dailySleepDocument = {
    id: "daily-sleep-1",
    day: "2026-07-10",
    timestamp: "2026-07-10T00:00:00+09:00",
    score: null,
    contributors: {},
};

const sleepDocument = {
    id: "sleep-1",
    day: "2026-07-10",
    bedtime_start: "2026-07-09T23:30:00+09:00",
    bedtime_end: "2026-07-10T07:30:00+09:00",
    total_sleep_duration: 27_000,
    average_heart_rate: 54.5,
    average_hrv: 48,
    type: "long_sleep",
};

const createJsonResponse = (body: unknown, status = 200): Response => {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
};

const baseEnv = {
    name: "ring",
    oura_access_token: "old-access-token",
    oura_timezone: "Asia/Tokyo",
};

describe("isOuraEnv", () => {
    test("accepts a non-empty OAuth access token", () => {
        expect(isOuraEnv({ oura_access_token: "token" })).toBe(true);
    });

    test("rejects missing or empty access tokens", () => {
        expect(isOuraEnv({})).toBe(false);
        expect(isOuraEnv({ oura_access_token: "" })).toBe(false);
        expect(isOuraEnv(null)).toBe(false);
    });

    test("accepts a complete 1Password token-store reference", () => {
        expect(isOuraEnv({
            oura_token_store: "1password",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
        })).toBe(true);
    });
});

describe("convertOuraDocument", () => {
    test("keeps common and useful activity fields with the complete payload", () => {
        const record = convertOuraDocument("daily_activity", activityDocument);

        expect(record).toMatchObject({
            type: OuraType,
            id: "activity-1",
            dataType: "daily_activity",
            day: "2026-07-10",
            score: 82,
            steps: 10_234,
            activeCalories: 450,
        });
        expect(record.unixTimeMs).toBe(new Date(activityDocument.timestamp).getTime());
        expect(JSON.parse(record.rawData)).toEqual(activityDocument);
    });

    test("preserves a null daily score", () => {
        const record = convertOuraDocument("daily_sleep", dailySleepDocument);
        expect(record).toHaveProperty("score", null);
    });

    test("maps detailed sleep metrics and uses bedtime_end as its timestamp", () => {
        const record = convertOuraDocument("sleep", sleepDocument);
        expect(record).toMatchObject({
            durationSeconds: 27_000,
            averageHeartRate: 54.5,
            averageHrv: 48,
            sleepType: "long_sleep",
        });
        expect(record.unixTimeMs).toBe(new Date(sleepDocument.bedtime_end).getTime());
    });

    test("uses data type and document id as the upsert key", () => {
        const activity = convertOuraDocument("daily_activity", activityDocument);
        const sameIdSleep = convertOuraDocument("daily_sleep", {
            ...dailySleepDocument,
            id: activity.id,
        });
        expect(getOuraRecordKey(activity)).toBe("daily_activity:activity-1");
        expect(getOuraRecordKey(sameIdSleep)).toBe("daily_sleep:activity-1");
    });
});

describe("fetchOura", () => {
    let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
    const originalRetryCount = process.env.CHRONIXD_RETRY_COUNT;
    const originalGitHubActions = process.env.GITHUB_ACTIONS;
    const originalTokenCacheDir = process.env.OURA_TOKEN_CACHE_DIR;

    beforeEach(async () => {
        process.env.CHRONIXD_RETRY_COUNT = "0";
        delete process.env.CHRONIXD_DRY_RUN;
        delete process.env.GITHUB_ACTIONS;
        delete process.env.OURA_TOKEN_CACHE_DIR;
        await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
        await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
    });

    afterEach(async () => {
        fetchSpy?.mockRestore();
        fetchSpy = undefined;
        delete process.env.CHRONIXD_DRY_RUN;
        if (originalRetryCount === undefined) {
            delete process.env.CHRONIXD_RETRY_COUNT;
        } else {
            process.env.CHRONIXD_RETRY_COUNT = originalRetryCount;
        }
        if (originalGitHubActions === undefined) delete process.env.GITHUB_ACTIONS;
        else process.env.GITHUB_ACTIONS = originalGitHubActions;
        if (originalTokenCacheDir === undefined) delete process.env.OURA_TOKEN_CACHE_DIR;
        else process.env.OURA_TOKEN_CACHE_DIR = originalTokenCacheDir;
        await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
    });

    test("fetches the four default daily-scope collections with a Bearer token", async () => {
        const responseByPath: Record<string, unknown> = {
            daily_activity: activityDocument,
            daily_readiness: readinessDocument,
            daily_sleep: dailySleepDocument,
            sleep: sleepDocument,
        };
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input, init) => {
            const url = new URL(String(input));
            const dataType = url.pathname.split("/").at(-1) as string;
            expect(init?.headers).toEqual({ Authorization: "Bearer old-access-token" });
            expect(url.searchParams.get("start_date")).toBe("2026-06-12");
            expect(url.searchParams.get("end_date")).toBe("2026-07-11");
            return Promise.resolve(createJsonResponse({ data: [responseByPath[dataType]], next_token: null }));
        }) as typeof fetch);

        const records = await fetchOura(baseEnv, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        });

        expect(fetchSpy).toHaveBeenCalledTimes(4);
        expect(records.map((record) => record.dataType)).toEqual([
            "daily_activity",
            "daily_readiness",
            "daily_sleep",
            "sleep",
        ]);
        expect(records[1].temperatureDeviation).toBe(-0.2);
    });

    test("paginates with next_token and overlaps seven days from the last Oura day", async () => {
        fetchSpy = spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(createJsonResponse({ data: [activityDocument], next_token: "page-2" }))
            .mockResolvedValueOnce(createJsonResponse({
                data: [{ ...activityDocument, id: "activity-2", day: "2026-07-11", timestamp: "2026-07-11T04:00:00+09:00" }],
                next_token: null,
            }));

        const lastRecord = convertOuraDocument("daily_sleep", dailySleepDocument);
        const records = await fetchOura(
            { ...baseEnv, oura_data_types: ["daily_activity"] },
            lastRecord,
            { limit: 1000 },
            { now: NOW, cacheDir: TEST_CACHE_DIR },
        );

        expect(records).toHaveLength(2);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const firstUrl = new URL(String(fetchSpy.mock.calls[0][0]));
        const secondUrl = new URL(String(fetchSpy.mock.calls[1][0]));
        expect(firstUrl.searchParams.get("start_date")).toBe("2026-07-03");
        expect(firstUrl.searchParams.has("next_token")).toBe(false);
        expect(secondUrl.searchParams.get("next_token")).toBe("page-2");
    });

    test("applies the global limit without starving configured data types", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({
            data: [
                activityDocument,
                { ...activityDocument, id: "activity-2", timestamp: "2026-07-11T04:00:00+09:00" },
                { ...activityDocument, id: "activity-3", timestamp: "2026-07-09T04:00:00+09:00" },
            ],
            next_token: null,
        }));

        const records = await fetchOura(
            { ...baseEnv, oura_data_types: ["daily_activity"] },
            null,
            { limit: 2 },
            { now: NOW, cacheDir: TEST_CACHE_DIR },
        );

        expect(records).toHaveLength(2);
        expect(records.map((record) => record.id)).toEqual(["activity-2", "activity-1"]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("reserves part of a small limit for every configured data type", async () => {
        const documents: Record<string, object> = {
            daily_activity: activityDocument,
            daily_readiness: readinessDocument,
            daily_sleep: dailySleepDocument,
            sleep: sleepDocument,
        };
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input) => {
            const dataType = new URL(String(input)).pathname.split("/").at(-1) as string;
            return Promise.resolve(createJsonResponse({ data: [documents[dataType]], next_token: null }));
        }) as typeof fetch);

        const records = await fetchOura(baseEnv, null, { limit: 4 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        });

        expect(records.map((record) => record.dataType)).toEqual([
            "daily_activity",
            "daily_readiness",
            "daily_sleep",
            "sleep",
        ]);
        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    test("reallocates unused type shares to a collection with more records", async () => {
        const sleepRecords = Array.from({ length: 5 }, (_, index) => ({
            ...sleepDocument,
            id: `sleep-${index}`,
            bedtime_end: `2026-07-10T0${index + 4}:30:00+09:00`,
        }));
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input) => {
            const dataType = new URL(String(input)).pathname.split("/").at(-1);
            return Promise.resolve(createJsonResponse({
                data: dataType === "sleep" ? sleepRecords : [],
                next_token: null,
            }));
        }) as typeof fetch);

        const records = await fetchOura(baseEnv, null, { limit: 4 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        });

        expect(records).toHaveLength(4);
        expect(records.every((record) => record.dataType === "sleep")).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    test("includes the Oura error detail without exposing the access token", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({
            status: 403,
            title: "Access forbidden",
            detail: "Missing required daily scope",
        }, 403));

        let error: Error | undefined;
        try {
            await fetchOura(
                { ...baseEnv, oura_data_types: ["daily_sleep"] },
                null,
                { limit: 1000 },
                { now: NOW, cacheDir: TEST_CACHE_DIR },
            );
        } catch (caught) {
            error = caught as Error;
        }

        expect(error?.message).toContain("Failed to fetch Oura daily_sleep: 403");
        expect(error?.message).toContain("Missing required daily scope");
        expect(error?.message).not.toContain(baseEnv.oura_access_token);
    });

    test("surfaces an exhausted 429 response as RateLimitError", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({
            status: 429,
            title: "Too Many Requests",
        }, 429));

        let error: Error | undefined;
        try {
            await fetchOura(
                { ...baseEnv, oura_data_types: ["daily_sleep"] },
                null,
                { limit: 1000 },
                { now: NOW, cacheDir: TEST_CACHE_DIR },
            );
        } catch (caught) {
            error = caught as Error;
        }

        expect(error).toBeInstanceOf(RateLimitError);
        expect(error?.message).toContain("Failed to fetch Oura daily_sleep: 429");
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("refreshes once on 401, persists rotated tokens, and reuses them", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input, init) => {
            const url = String(input);
            if (url === "https://api.ouraring.com/oauth/token") {
                expect(init?.method).toBe("POST");
                expect(String(init?.body)).toContain("refresh_token=old-refresh-token");
                return Promise.resolve(createJsonResponse({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    expires_in: 3600,
                }));
            }

            const authorization = (init?.headers as Record<string, string>).Authorization;
            if (authorization === "Bearer old-access-token") {
                return Promise.resolve(createJsonResponse({
                    status: 401,
                    title: "Invalid Access Token",
                }, 401));
            }
            expect(authorization).toBe("Bearer new-access-token");
            return Promise.resolve(createJsonResponse({ data: [dailySleepDocument], next_token: null }));
        }) as typeof fetch);

        const refreshEnv: OuraEnv = {
            ...baseEnv,
            oura_data_types: ["daily_sleep"],
            oura_refresh_token: "old-refresh-token",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        };
        const first = await fetchOura(refreshEnv, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        });
        const second = await fetchOura(refreshEnv, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        });

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(fetchSpy).toHaveBeenCalledTimes(4);
        const cacheFiles = await fs.readdir(TEST_CACHE_DIR);
        expect(cacheFiles).toHaveLength(1);
        const cachePath = path.join(TEST_CACHE_DIR, cacheFiles[0]);
        const cached = JSON.parse(await fs.readFile(cachePath, "utf-8"));
        expect(cached).toMatchObject({
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
        });
        expect((await fs.stat(cachePath)).mode & 0o077).toBe(0);
    });

    test("serializes concurrent refreshes and reuses the first rotated token", async () => {
        let tokenRequestCount = 0;
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (input, init) => {
            if (String(input) === "https://api.ouraring.com/oauth/token") {
                tokenRequestCount += 1;
                await new Promise((resolve) => setTimeout(resolve, 50));
                return createJsonResponse({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                });
            }
            const authorization = (init?.headers as Record<string, string>).Authorization;
            if (authorization === "Bearer old-access-token") {
                return createJsonResponse({ status: 401 }, 401);
            }
            expect(authorization).toBe("Bearer new-access-token");
            return createJsonResponse({ data: [dailySleepDocument] });
        }) as typeof fetch);
        const env: OuraEnv = {
            ...baseEnv,
            oura_data_types: ["daily_sleep"],
            oura_refresh_token: "old-refresh-token",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        };

        const [first, second] = await Promise.all([
            fetchOura(env, null, { limit: 1000 }, { now: NOW, cacheDir: TEST_CACHE_DIR }),
            fetchOura(env, null, { limit: 1000 }, { now: NOW, cacheDir: TEST_CACHE_DIR }),
        ]);

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(tokenRequestCount).toBe(1);
    });

    test("recovers a refresh lock whose owning process has exited", async () => {
        const fingerprint = createHash("sha256")
            .update("client-id\0old-refresh-token")
            .digest("hex")
            .slice(0, 12);
        const lockPath = path.join(TEST_CACHE_DIR, `oura-oauth-${fingerprint}.json.lock`);
        await fs.writeFile(lockPath, JSON.stringify({
            pid: 999_999_999,
            hostname: hostname(),
            createdAt: "2026-07-11T00:00:00.000Z",
        }), { mode: 0o600 });
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input, init) => {
            if (String(input) === "https://api.ouraring.com/oauth/token") {
                return Promise.resolve(createJsonResponse({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                }));
            }
            const authorization = (init?.headers as Record<string, string>).Authorization;
            if (authorization === "Bearer old-access-token") {
                return Promise.resolve(createJsonResponse({ status: 401 }, 401));
            }
            return Promise.resolve(createJsonResponse({ data: [dailySleepDocument] }));
        }) as typeof fetch);

        const records = await fetchOura({
            ...baseEnv,
            oura_data_types: ["daily_sleep"],
            oura_refresh_token: "old-refresh-token",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        }, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        });

        expect(records).toHaveLength(1);
        await expect(fs.access(lockPath)).rejects.toThrow();
    });

    test("never retries an ambiguous refresh-token request failure", async () => {
        process.env.CHRONIXD_RETRY_COUNT = "2";
        fetchSpy = spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(createJsonResponse({ status: 401 }, 401))
            .mockRejectedValueOnce(new TypeError("connection closed after request"));

        let error: Error | undefined;
        try {
            await fetchOura({
                ...baseEnv,
                oura_data_types: ["daily_sleep"],
                oura_refresh_token: "refresh-token",
                oura_client_id: "client-id",
                oura_client_secret: "client-secret",
            }, null, { limit: 1000 }, {
                now: NOW,
                cacheDir: TEST_CACHE_DIR,
            });
        } catch (caught) {
            error = caught as Error;
        }

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(error).not.toBeInstanceOf(TypeError);
        expect(error?.message).toContain("request outcome is unknown");
        expect(error?.message).toContain("reauthorize before retrying");

        fetchSpy.mockClear();
        await expect(fetchOura({
            ...baseEnv,
            oura_data_types: ["daily_sleep"],
            oura_refresh_token: "refresh-token",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        }, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        })).rejects.toThrow("previous Oura OAuth refresh did not complete safely");
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("redacts every configured credential from OAuth errors", async () => {
        const secrets = {
            access: "access-secret-value",
            refresh: "refresh-secret-value",
            clientId: "client-id-value",
            clientSecret: "client-secret-value",
        };
        fetchSpy = spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(createJsonResponse({ status: 401 }, 401))
            .mockResolvedValueOnce(createJsonResponse({
                error: "invalid_grant",
                error_description: Object.values(secrets).join(" "),
            }, 400));

        let error: Error | undefined;
        try {
            await fetchOura({
                ...baseEnv,
                oura_access_token: secrets.access,
                oura_data_types: ["daily_sleep"],
                oura_refresh_token: secrets.refresh,
                oura_client_id: secrets.clientId,
                oura_client_secret: secrets.clientSecret,
            }, null, { limit: 1000 }, {
                now: NOW,
                cacheDir: TEST_CACHE_DIR,
            });
        } catch (caught) {
            error = caught as Error;
        }

        expect(error?.message).toContain("[REDACTED]");
        expect(error?.message).toContain("reauthorize before retrying");
        for (const secret of Object.values(secrets)) {
            expect(error?.message).not.toContain(secret);
        }
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("fails closed when a rotated-token cache loses its refresh token", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input, init) => {
            if (String(input) === "https://api.ouraring.com/oauth/token") {
                return Promise.resolve(createJsonResponse({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                }));
            }
            const authorization = (init?.headers as Record<string, string>).Authorization;
            if (authorization === "Bearer old-access-token") {
                return Promise.resolve(createJsonResponse({ status: 401 }, 401));
            }
            return Promise.resolve(createJsonResponse({ data: [dailySleepDocument] }));
        }) as typeof fetch);
        const env: OuraEnv = {
            ...baseEnv,
            oura_data_types: ["daily_sleep"],
            oura_refresh_token: "old-refresh-token",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        };
        await fetchOura(env, null, { limit: 1000 }, { now: NOW, cacheDir: TEST_CACHE_DIR });

        const [cacheFile] = await fs.readdir(TEST_CACHE_DIR);
        const cachePath = path.join(TEST_CACHE_DIR, cacheFile);
        const cache = JSON.parse(await fs.readFile(cachePath, "utf-8"));
        delete cache.refreshToken;
        await fs.writeFile(cachePath, JSON.stringify(cache), { mode: 0o600 });
        fetchSpy.mockClear();

        await expect(fetchOura(env, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        })).rejects.toThrow("refreshToken is missing");
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("requires an explicit durable token directory before refreshing on GitHub Actions", async () => {
        process.env.GITHUB_ACTIONS = "true";
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({ data: [] }));

        await expect(fetchOura({
            ...baseEnv,
            oura_refresh_token: "refresh-token",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        }, null, { limit: 1000 }, { now: NOW })).rejects.toThrow(
            "requires an explicit durable OURA_TOKEN_CACHE_DIR",
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("refreshes through 1Password on GitHub Actions and leaves no local token file", async () => {
        process.env.GITHUB_ACTIONS = "true";
        let item = {
            id: "oura-item-id",
            category: "API_CREDENTIAL",
            fields: [
                { id: "access_token", label: "access_token", type: "CONCEALED", value: "old-access-token" },
                { id: "refresh_token", label: "refresh_token", type: "CONCEALED", value: "old-refresh-token" },
                { id: "expires_at", label: "expires_at", type: "STRING", value: "" },
                { id: "refresh_status", label: "refresh_status", type: "STRING", value: "ready" },
            ],
        };
        const commandCalls: Array<{ args: string[]; standardInput?: string }> = [];
        const runner: OnePasswordCommandRunner = async (args, standardInput) => {
            commandCalls.push({ args, standardInput });
            if (args[1] === "get") return JSON.stringify(item);
            if (args[1] === "edit" && standardInput) {
                item = JSON.parse(standardInput);
                return "";
            }
            throw new Error(`unexpected command: ${args.join(" ")}`);
        };
        const fieldValue = (label: string): unknown => {
            return item.fields.find((field) => field.label === label)?.value;
        };
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input, init) => {
            if (String(input) === "https://api.ouraring.com/oauth/token") {
                expect(fieldValue("refresh_status")).toStartWith("uncertain:");
                return Promise.resolve(createJsonResponse({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    expires_in: 3600,
                }));
            }
            const authorization = (init?.headers as Record<string, string>).Authorization;
            if (authorization === "Bearer old-access-token") {
                return Promise.resolve(createJsonResponse({ status: 401 }, 401));
            }
            expect(authorization).toBe("Bearer new-access-token");
            return Promise.resolve(createJsonResponse({ data: [dailySleepDocument] }));
        }) as typeof fetch);

        const records = await fetchOura({
            name: "ring",
            oura_token_store: "1password",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
            oura_data_types: ["daily_sleep"],
            oura_timezone: "Asia/Tokyo",
        }, null, { limit: 1000 }, {
            now: NOW,
            onePasswordCommandRunner: runner,
        });

        expect(records).toHaveLength(1);
        expect(fieldValue("access_token")).toBe("new-access-token");
        expect(fieldValue("refresh_token")).toBe("new-refresh-token");
        expect(fieldValue("refresh_status")).toBe("ready");
        expect(commandCalls.filter((call) => call.args[1] === "edit")).toHaveLength(2);
        expect(await fs.readdir(TEST_CACHE_DIR)).toEqual([]);
    });

    test("serializes concurrent 1Password refreshes within the process", async () => {
        let item = {
            category: "API_CREDENTIAL",
            fields: [
                { id: "access_token", label: "access_token", type: "CONCEALED", value: "old-access-token" },
                { id: "refresh_token", label: "refresh_token", type: "CONCEALED", value: "old-refresh-token" },
                { id: "expires_at", label: "expires_at", type: "STRING", value: "" },
                { id: "refresh_status", label: "refresh_status", type: "STRING", value: "ready" },
            ],
        };
        const runner: OnePasswordCommandRunner = async (args, standardInput) => {
            if (args[1] === "get") return JSON.stringify(item);
            if (args[1] === "edit" && standardInput) {
                item = JSON.parse(standardInput);
                return "";
            }
            throw new Error(`unexpected command: ${args.join(" ")}`);
        };
        let tokenRequestCount = 0;
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (input, init) => {
            if (String(input) === "https://api.ouraring.com/oauth/token") {
                tokenRequestCount += 1;
                await new Promise((resolve) => setTimeout(resolve, 50));
                return createJsonResponse({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                });
            }
            const authorization = (init?.headers as Record<string, string>).Authorization;
            if (authorization === "Bearer old-access-token") {
                return createJsonResponse({ status: 401 }, 401);
            }
            return createJsonResponse({ data: [dailySleepDocument] });
        }) as typeof fetch);
        const env: OuraEnv = {
            name: "ring",
            oura_token_store: "1password",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
            oura_data_types: ["daily_sleep"],
        };

        const [first, second] = await Promise.all([
            fetchOura(env, null, { limit: 1000 }, { now: NOW, onePasswordCommandRunner: runner }),
            fetchOura(env, null, { limit: 1000 }, { now: NOW, onePasswordCommandRunner: runner }),
        ]);

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(tokenRequestCount).toBe(1);
    });

    test("does not consume the refresh token when 1Password cannot mark the attempt", async () => {
        const item = {
            category: "API_CREDENTIAL",
            fields: [
                { id: "access_token", label: "access_token", type: "CONCEALED", value: "old-access-token" },
                { id: "refresh_token", label: "refresh_token", type: "CONCEALED", value: "old-refresh-token" },
                { id: "expires_at", label: "expires_at", type: "STRING", value: "" },
                { id: "refresh_status", label: "refresh_status", type: "STRING", value: "ready" },
            ],
        };
        const runner: OnePasswordCommandRunner = async (args) => {
            if (args[1] === "get") return JSON.stringify(item);
            throw new Error("1Password write unavailable");
        };
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input) => {
            expect(String(input)).not.toBe("https://api.ouraring.com/oauth/token");
            return Promise.resolve(createJsonResponse({ status: 401 }, 401));
        }) as typeof fetch);

        await expect(fetchOura({
            name: "ring",
            oura_token_store: "1password",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
            oura_data_types: ["daily_sleep"],
        }, null, { limit: 1000 }, {
            now: NOW,
            onePasswordCommandRunner: runner,
        })).rejects.toThrow("1Password write unavailable");
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("leaves 1Password uncertain when committing rotated tokens fails", async () => {
        let item = {
            category: "API_CREDENTIAL",
            fields: [
                { id: "access_token", label: "access_token", type: "CONCEALED", value: "old-access-token" },
                { id: "refresh_token", label: "refresh_token", type: "CONCEALED", value: "old-refresh-token" },
                { id: "expires_at", label: "expires_at", type: "STRING", value: "" },
                { id: "refresh_status", label: "refresh_status", type: "STRING", value: "ready" },
            ],
        };
        let editCount = 0;
        const runner: OnePasswordCommandRunner = async (args, standardInput) => {
            if (args[1] === "get") return JSON.stringify(item);
            if (args[1] === "edit" && standardInput) {
                editCount += 1;
                if (editCount >= 2) throw new Error("1Password commit unavailable");
                item = JSON.parse(standardInput);
                return "";
            }
            throw new Error(`unexpected command: ${args.join(" ")}`);
        };
        fetchSpy = spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(createJsonResponse({ status: 401 }, 401))
            .mockResolvedValueOnce(createJsonResponse({
                access_token: "new-access-token",
                refresh_token: "new-refresh-token",
            }));
        const env: OuraEnv = {
            name: "ring",
            oura_token_store: "1password",
            oura_1password_vault: "chronixd",
            oura_1password_item: "oura-oauth",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
            oura_data_types: ["daily_sleep"],
        };

        await expect(fetchOura(env, null, { limit: 1000 }, {
            now: NOW,
            onePasswordCommandRunner: runner,
        })).rejects.toThrow("1Password commit unavailable");
        expect(item.fields.find((field) => field.label === "refresh_status")?.value).toStartWith("uncertain:");

        fetchSpy.mockClear();
        await expect(fetchOura(env, null, { limit: 1000 }, {
            now: NOW,
            onePasswordCommandRunner: runner,
        })).rejects.toThrow("previous Oura OAuth refresh did not complete safely");
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("does not consume a single-use refresh token during dry-run", async () => {
        process.env.CHRONIXD_DRY_RUN = "true";
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({ status: 401 }, 401));

        await expect(fetchOura({
            ...baseEnv,
            oura_data_types: ["daily_sleep"],
            oura_refresh_token: "refresh-token",
            oura_client_id: "client-id",
            oura_client_secret: "client-secret",
        }, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        })).rejects.toThrow("refresh is disabled in CHRONIXD_DRY_RUN");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(await fs.readdir(TEST_CACHE_DIR)).toEqual([]);
    });

    test("rejects partial refresh configuration before making a request", async () => {
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({ data: [] }));

        await expect(fetchOura({
            ...baseEnv,
            oura_refresh_token: "refresh-token",
        }, null, { limit: 1000 }, {
            now: NOW,
            cacheDir: TEST_CACHE_DIR,
        })).rejects.toThrow("must be configured together");
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
