import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
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

type TokenItemOptions = {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    refreshStatus?: string;
};

const createOnePasswordItem = (options: TokenItemOptions = {}) => ({
    id: "oura-item-id",
    category: "API_CREDENTIAL",
    fields: [
        {
            id: "access_token",
            label: "access_token",
            type: "CONCEALED",
            value: options.accessToken ?? "old-access-token",
        },
        {
            id: "refresh_token",
            label: "refresh_token",
            type: "CONCEALED",
            value: options.refreshToken ?? "old-refresh-token",
        },
        {
            id: "expires_at",
            label: "expires_at",
            type: "STRING",
            value: options.expiresAt ?? "",
        },
        {
            id: "refresh_status",
            label: "refresh_status",
            type: "STRING",
            value: options.refreshStatus ?? "ready",
        },
    ],
});

const createOnePasswordStore = (options: TokenItemOptions = {}) => {
    let item = createOnePasswordItem(options);
    const calls: Array<{ args: string[]; standardInput?: string }> = [];
    const runner: OnePasswordCommandRunner = async (args, standardInput) => {
        calls.push({ args, standardInput });
        if (args[1] === "get") return JSON.stringify(item);
        if (args[1] === "edit" && standardInput) {
            item = JSON.parse(standardInput);
            return "";
        }
        throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    return {
        calls,
        getItem: () => item,
        getFieldValue: (label: string): unknown => {
            return item.fields.find((field) => field.label === label)?.value;
        },
        runner,
    };
};

const baseEnv: OuraEnv = {
    name: "ring",
    oura_1password_vault: "chronixd",
    oura_1password_item: "oura-oauth",
    oura_client_id: "client-id",
    oura_client_secret: "client-secret",
    oura_timezone: "Asia/Tokyo",
};

describe("isOuraEnv", () => {
    test("accepts a complete 1Password OAuth configuration", () => {
        expect(isOuraEnv(baseEnv)).toBe(true);
    });

    test("rejects incomplete 1Password OAuth configurations", () => {
        for (const key of [
            "oura_1password_vault",
            "oura_1password_item",
            "oura_client_id",
            "oura_client_secret",
        ] as const) {
            expect(isOuraEnv({ ...baseEnv, [key]: "" })).toBe(false);
        }
        expect(isOuraEnv({})).toBe(false);
        expect(isOuraEnv(null)).toBe(false);
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
    const originalDryRun = process.env.CHRONIXD_DRY_RUN;

    beforeEach(() => {
        process.env.CHRONIXD_RETRY_COUNT = "0";
        delete process.env.CHRONIXD_DRY_RUN;
    });

    afterEach(() => {
        fetchSpy?.mockRestore();
        fetchSpy = undefined;
        if (originalRetryCount === undefined) delete process.env.CHRONIXD_RETRY_COUNT;
        else process.env.CHRONIXD_RETRY_COUNT = originalRetryCount;
        if (originalDryRun === undefined) delete process.env.CHRONIXD_DRY_RUN;
        else process.env.CHRONIXD_DRY_RUN = originalDryRun;
    });

    test("fetches the four default collections with the token loaded from 1Password", async () => {
        const store = createOnePasswordStore();
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
            onePasswordCommandRunner: store.runner,
        });

        expect(fetchSpy).toHaveBeenCalledTimes(4);
        expect(records.map((record) => record.dataType)).toEqual([
            "daily_activity",
            "daily_readiness",
            "daily_sleep",
            "sleep",
        ]);
        expect(records[1].temperatureDeviation).toBe(-0.2);
        expect(store.calls.filter((call) => call.args[1] === "edit")).toHaveLength(0);
    });

    test("paginates and overlaps seven days from the last Oura day", async () => {
        const store = createOnePasswordStore();
        fetchSpy = spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(createJsonResponse({ data: [activityDocument], next_token: "page-2" }))
            .mockResolvedValueOnce(createJsonResponse({
                data: [{
                    ...activityDocument,
                    id: "activity-2",
                    day: "2026-07-11",
                    timestamp: "2026-07-11T04:00:00+09:00",
                }],
                next_token: null,
            }));

        const lastRecord = convertOuraDocument("daily_sleep", dailySleepDocument);
        const records = await fetchOura(
            { ...baseEnv, oura_data_types: ["daily_activity"] },
            lastRecord,
            { limit: 1000 },
            { now: NOW, onePasswordCommandRunner: store.runner },
        );

        expect(records).toHaveLength(2);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const firstUrl = new URL(String(fetchSpy.mock.calls[0][0]));
        const secondUrl = new URL(String(fetchSpy.mock.calls[1][0]));
        expect(firstUrl.searchParams.get("start_date")).toBe("2026-07-03");
        expect(firstUrl.searchParams.has("next_token")).toBe(false);
        expect(secondUrl.searchParams.get("next_token")).toBe("page-2");
    });

    test("applies the global limit", async () => {
        const store = createOnePasswordStore();
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
            { now: NOW, onePasswordCommandRunner: store.runner },
        );

        expect(records.map((record) => record.id)).toEqual(["activity-2", "activity-1"]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("reserves part of a small limit for every configured data type", async () => {
        const store = createOnePasswordStore();
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
            onePasswordCommandRunner: store.runner,
        });

        expect(records.map((record) => record.dataType)).toEqual([
            "daily_activity",
            "daily_readiness",
            "daily_sleep",
            "sleep",
        ]);
    });

    test("reallocates unused type shares to a collection with more records", async () => {
        const store = createOnePasswordStore();
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
            onePasswordCommandRunner: store.runner,
        });

        expect(records).toHaveLength(4);
        expect(records.every((record) => record.dataType === "sleep")).toBe(true);
    });

    test("includes an Oura API error detail without exposing the access token", async () => {
        const store = createOnePasswordStore();
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
                { now: NOW, onePasswordCommandRunner: store.runner },
            );
        } catch (caught) {
            error = caught as Error;
        }

        expect(error?.message).toContain("Failed to fetch Oura daily_sleep: 403");
        expect(error?.message).toContain("Missing required daily scope");
        expect(error?.message).not.toContain("old-access-token");
    });

    test("surfaces an exhausted 429 response as RateLimitError", async () => {
        const store = createOnePasswordStore();
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
                { now: NOW, onePasswordCommandRunner: store.runner },
            );
        } catch (caught) {
            error = caught as Error;
        }

        expect(error).toBeInstanceOf(RateLimitError);
        expect(error?.message).toContain("Failed to fetch Oura daily_sleep: 429");
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("refreshes once on 401 and writes the rotated pair back to 1Password", async () => {
        const store = createOnePasswordStore();
        let tokenRequestCount = 0;
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input, init) => {
            if (String(input) === "https://api.ouraring.com/oauth/token") {
                tokenRequestCount += 1;
                expect(store.getFieldValue("refresh_status")).toStartWith("uncertain:");
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
                return Promise.resolve(createJsonResponse({ status: 401 }, 401));
            }
            expect(authorization).toBe("Bearer new-access-token");
            return Promise.resolve(createJsonResponse({ data: [dailySleepDocument], next_token: null }));
        }) as typeof fetch);
        const env: OuraEnv = { ...baseEnv, oura_data_types: ["daily_sleep"] };

        const first = await fetchOura(env, null, { limit: 1000 }, {
            now: NOW,
            onePasswordCommandRunner: store.runner,
        });
        const second = await fetchOura(env, null, { limit: 1000 }, {
            now: NOW,
            onePasswordCommandRunner: store.runner,
        });

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(tokenRequestCount).toBe(1);
        expect(store.getFieldValue("access_token")).toBe("new-access-token");
        expect(store.getFieldValue("refresh_token")).toBe("new-refresh-token");
        expect(store.getFieldValue("refresh_status")).toBe("ready");
        expect(store.calls.filter((call) => call.args[1] === "edit")).toHaveLength(2);
    });

    test("serializes concurrent refreshes within the process", async () => {
        const store = createOnePasswordStore();
        let tokenRequestCount = 0;
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (input, init) => {
            if (String(input) === "https://api.ouraring.com/oauth/token") {
                tokenRequestCount += 1;
                await new Promise((resolve) => setTimeout(resolve, 25));
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
        const env: OuraEnv = { ...baseEnv, oura_data_types: ["daily_sleep"] };

        const [first, second] = await Promise.all([
            fetchOura(env, null, { limit: 1000 }, { now: NOW, onePasswordCommandRunner: store.runner }),
            fetchOura(env, null, { limit: 1000 }, { now: NOW, onePasswordCommandRunner: store.runner }),
        ]);

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(tokenRequestCount).toBe(1);
    });

    test("never retries an ambiguous single-use refresh request", async () => {
        process.env.CHRONIXD_RETRY_COUNT = "2";
        const store = createOnePasswordStore();
        fetchSpy = spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(createJsonResponse({ status: 401 }, 401))
            .mockRejectedValueOnce(new TypeError("connection closed after request"));

        let error: Error | undefined;
        try {
            await fetchOura(
                { ...baseEnv, oura_data_types: ["daily_sleep"] },
                null,
                { limit: 1000 },
                { now: NOW, onePasswordCommandRunner: store.runner },
            );
        } catch (caught) {
            error = caught as Error;
        }

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(error).not.toBeInstanceOf(TypeError);
        expect(error?.message).toContain("request outcome is unknown");
        expect(error?.message).toContain("reauthorize before retrying");
        expect(store.getFieldValue("refresh_status")).toStartWith("uncertain:");

        fetchSpy.mockClear();
        await expect(fetchOura(
            { ...baseEnv, oura_data_types: ["daily_sleep"] },
            null,
            { limit: 1000 },
            { now: NOW, onePasswordCommandRunner: store.runner },
        )).rejects.toThrow("previous Oura OAuth refresh did not complete safely");
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("redacts every credential from OAuth errors", async () => {
        const secrets = {
            access: "access-secret-value",
            refresh: "refresh-secret-value",
            clientId: "client-id-value",
            clientSecret: "client-secret-value",
        };
        const store = createOnePasswordStore({
            accessToken: secrets.access,
            refreshToken: secrets.refresh,
        });
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
                oura_client_id: secrets.clientId,
                oura_client_secret: secrets.clientSecret,
                oura_data_types: ["daily_sleep"],
            }, null, { limit: 1000 }, {
                now: NOW,
                onePasswordCommandRunner: store.runner,
            });
        } catch (caught) {
            error = caught as Error;
        }

        expect(error?.message).toContain("[REDACTED]");
        expect(error?.message).toContain("reauthorize before retrying");
        for (const secret of Object.values(secrets)) {
            expect(error?.message).not.toContain(secret);
        }
    });

    test("does not call Oura token endpoint when 1Password cannot mark the attempt", async () => {
        const item = createOnePasswordItem();
        const runner: OnePasswordCommandRunner = async (args) => {
            if (args[1] === "get") return JSON.stringify(item);
            throw new Error("1Password write unavailable");
        };
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((input) => {
            expect(String(input)).not.toBe("https://api.ouraring.com/oauth/token");
            return Promise.resolve(createJsonResponse({ status: 401 }, 401));
        }) as typeof fetch);

        await expect(fetchOura(
            { ...baseEnv, oura_data_types: ["daily_sleep"] },
            null,
            { limit: 1000 },
            { now: NOW, onePasswordCommandRunner: runner },
        )).rejects.toThrow("1Password write unavailable");
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("leaves 1Password uncertain when committing rotated tokens fails", async () => {
        let item = createOnePasswordItem();
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
        const env: OuraEnv = { ...baseEnv, oura_data_types: ["daily_sleep"] };

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
        const store = createOnePasswordStore();
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({ status: 401 }, 401));

        await expect(fetchOura(
            { ...baseEnv, oura_data_types: ["daily_sleep"] },
            null,
            { limit: 1000 },
            { now: NOW, onePasswordCommandRunner: store.runner },
        )).rejects.toThrow("refresh is disabled in CHRONIXD_DRY_RUN");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(store.calls.filter((call) => call.args[1] === "edit")).toHaveLength(0);
    });

    test("rejects missing OAuth application credentials before an HTTP request", async () => {
        const store = createOnePasswordStore();
        fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({ data: [] }));
        const incompleteEnv = {
            ...baseEnv,
            oura_client_secret: "",
            oura_data_types: ["daily_sleep"],
        } as OuraEnv;

        await expect(fetchOura(incompleteEnv, null, { limit: 1000 }, {
            now: NOW,
            onePasswordCommandRunner: store.runner,
        })).rejects.toThrow("oura_client_id and oura_client_secret are required");
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
