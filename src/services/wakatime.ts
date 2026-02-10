import { BaseRecord, WakaTimeRecord, ServiceDefinition, FetchOptions, ReplaceFilter } from "../common/types.js";
import { createCache } from "../common/cache.js";
import { createLogger } from "../common/logger.js";
import { fetchWithRetry } from "../common/fetchWithRetry.js";

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
    ai_additions?: number;
    ai_deletions?: number;
    human_additions?: number;
    human_deletions?: number;
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
        aiAdditions: duration.ai_additions,
        aiDeletions: duration.ai_deletions,
        humanAdditions: duration.human_additions,
        humanDeletions: duration.human_deletions,
    };
};

export const fetchWakaTime = async (
    env: WakaTimeEnv,
    lastRecord: BaseRecord | null,
    options: FetchOptions
): Promise<{ records: WakaTimeRecord[]; replaceFilter: ReplaceFilter }> => {
    const now = new Date();
    const today = formatDate(now);

    // Durations APIは日単位なので、fromDateを日の先頭に切り捨てて当日のデータを再取得する
    const fromDate = lastRecord
        ? new Date(new Date(lastRecord.unixTimeMs).setHours(0, 0, 0, 0))
        : new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const dates = getDatesInRange(fromDate, now);
    if (dates.length === 0) {
        return { records: [], replaceFilter: { type: WakaTimeType, sinceUnixTimeMs: fromDate.getTime() } };
    }

    const cache = createCache<CacheItem>("wakatime.json");
    const cachedItems = await cache.read();
    const cachedDates = new Set(cachedItems.map((item) => item.date));

    const authHeader = `Basic ${Buffer.from(env.wakatime_api_key).toString("base64")}`;
    const records: WakaTimeRecord[] = [];
    const newCachedDates: CacheItem[] = [];
    let firstFetchedDate: Date | null = null;

    for (const date of dates) {
        if (cachedDates.has(date) && date !== today) {
            logger.debug("Skipping cached date: %s", date);
            continue;
        }

        if (firstFetchedDate === null) {
            const [y, m, d] = date.split("-").map(Number);
            firstFetchedDate = new Date(y, m - 1, d);
        }

        const url = `https://wakatime.com/api/v1/users/current/durations?date=${date}`;
        logger.info("Fetching durations for %s", date);

        const response = await fetchWithRetry(url, {
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

    const replaceFilter: ReplaceFilter = {
        type: WakaTimeType,
        sinceUnixTimeMs: firstFetchedDate ? firstFetchedDate.getTime() : fromDate.getTime(),
    };

    return { records, replaceFilter };
};

export const wakatimeService: ServiceDefinition = {
    writeMode: "replace",
    isEnv: isWakaTimeEnv,
    fetch: (env, lastRecord, options) => fetchWakaTime(env, lastRecord, options),
};
