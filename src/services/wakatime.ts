import { BaseRecord, WakaTimeRecord, ServiceDefinition, FetchOptions } from "../common/types.js";
import { createCache } from "../common/cache.js";
import { createLogger } from "../common/logger.js";

const logger = createLogger("WakaTime");

export type WakaTimeEnv = {
    wakatime_api_key: string;
};

export const WakaTimeType = "WakaTime" as const;

export const isWakaTimeEnv = (env: unknown): env is WakaTimeEnv => {
    if (typeof env !== "object" || env === null) {
        return false;
    }
    const e = env as Record<string, unknown>;
    return typeof e.wakatime_api_key === "string";
};

type WakaTimeDuration = {
    project: string;
    time: number;
    duration: number;
};

type WakaTimeDurationsResponse = {
    data: WakaTimeDuration[];
    start: string;
    end: string;
    timezone: string;
};

type CacheItem = {
    date: string;
};

const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const getDatesInRange = (from: Date, to: Date): string[] => {
    const dates: string[] = [];
    const current = new Date(from);
    current.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (current <= end) {
        dates.push(formatDate(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
};

const convertToRecord = (duration: WakaTimeDuration): WakaTimeRecord => {
    return {
        type: WakaTimeType,
        unixTimeMs: Math.floor(duration.time * 1000),
        project: duration.project,
        duration: duration.duration,
    };
};

export const fetchWakaTime = async (
    env: WakaTimeEnv,
    lastRecord: BaseRecord | null,
    options: FetchOptions
): Promise<WakaTimeRecord[]> => {
    const now = new Date();
    const today = formatDate(now);

    const fromDate = lastRecord
        ? new Date(lastRecord.unixTimeMs + 24 * 60 * 60 * 1000)
        : new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const dates = getDatesInRange(fromDate, now);
    if (dates.length === 0) {
        return [];
    }

    const cache = createCache<CacheItem>("wakatime.json");
    const cachedItems = await cache.read();
    const cachedDates = new Set(cachedItems.map((item) => item.date));

    const authHeader = `Basic ${Buffer.from(env.wakatime_api_key).toString("base64")}`;
    const records: WakaTimeRecord[] = [];
    const newCachedDates: CacheItem[] = [];

    for (const date of dates) {
        if (cachedDates.has(date) && date !== today) {
            logger.debug("Skipping cached date: %s", date);
            continue;
        }

        const url = `https://wakatime.com/api/v1/users/current/durations?date=${date}`;
        logger.info("Fetching durations for %s", date);

        const response = await fetch(url, {
            headers: {
                Authorization: authHeader,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch WakaTime durations: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as WakaTimeDurationsResponse;
        logger.info("Date %s: %d durations", date, data.data.length);

        for (const duration of data.data) {
            records.push(convertToRecord(duration));
            if (records.length >= options.limit) {
                break;
            }
        }

        newCachedDates.push({ date });

        if (records.length >= options.limit) {
            break;
        }
    }

    // Update cache: keep existing items and add new ones
    const updatedCache = [
        ...cachedItems.filter((item) => item.date !== today),
        ...newCachedDates,
    ];
    await cache.write(updatedCache);

    return records;
};

export const wakatimeService: ServiceDefinition = {
    writeMode: "append",
    isEnv: isWakaTimeEnv,
    fetch: (env, lastRecord, options) => fetchWakaTime(env, lastRecord, options),
};
