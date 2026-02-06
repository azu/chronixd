import { BaseRecord, SlackRecord, ServiceDefinition, FetchOptions } from "../common/types.js";
import { createLogger } from "../common/logger.js";
import { createCache } from "../common/cache.ts";

const logger = createLogger("Slack");

export type SlackEnv = {
    slack_token: string;
    slack_query: string;
};

export const SlackType = "Slack" as const;

export const isSlackEnv = (env: unknown): env is SlackEnv => {
    if (env === null || typeof env !== "object") return false;
    return typeof (env as SlackEnv).slack_token === "string" && typeof (env as SlackEnv).slack_query === "string";
};

type SlackMessage = {
    iid: string;
    ts: string;
    text: string;
    username: string;
    user: string;
    permalink: string;
    team: string;
    channel: {
        id: string;
        name: string;
    };
};

type SlackSearchResponse = {
    ok: boolean;
    error?: string;
    messages: {
        total: number;
        paging: {
            count: number;
            total: number;
            page: number;
            pages: number;
        };
        matches: SlackMessage[];
    };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const searchSlackMessages = async ({
    token,
    query,
    page,
    count,
}: {
    token: string;
    query: string;
    page: number;
    count: number;
}): Promise<SlackSearchResponse> => {
    const params = new URLSearchParams({
        query,
        sort: "timestamp",
        sort_dir: "desc",
        count: String(count),
        page: String(page),
    });
    const res = await fetch(`https://slack.com/api/search.messages?${params.toString()}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    });
    if (!res.ok) {
        throw new Error(`Slack API HTTP error: ${res.status}`);
    }
    const json = await res.json() as SlackSearchResponse;
    logger.debug("page:%d total:%d matches:%d pages:%d", page, json.messages?.total, json.messages?.matches?.length, json.messages?.paging?.pages);
    if (!json.ok) {
        if (json.error === "ratelimited") {
            const retryAfter = parseInt(res.headers.get("Retry-After") ?? "30", 10);
            logger.info("rate limited, retrying after %d seconds", retryAfter);
            await sleep(retryAfter * 1000);
            return searchSlackMessages({ token, query, page, count });
        }
        throw new Error(`Slack API error: ${json.error}`);
    }
    return json;
};

export const tsToUnixTimeMs = (ts: string): number => {
    return Math.floor(parseFloat(ts) * 1000);
};

type CacheItem = {
    ts: string;
};

export const fetchSlack = async (
    env: SlackEnv,
    lastRecord: BaseRecord | null,
    options: FetchOptions,
): Promise<SlackRecord[]> => {
    const cache = createCache<CacheItem>("slack.json", { maxItems: 10000 });
    const cachedItems = await cache.read();
    const cachedTsSet = new Set(cachedItems.map((item) => item.ts));

    const allRecords: SlackRecord[] = [];
    const perPage = 100;
    const maxPages = Math.min(100, Math.ceil(options.limit / perPage));
    let shouldStop = false;

    for (let page = 1; page <= maxPages; page++) {
        if (shouldStop) break;

        logger.info("fetching page %d", page);
        const response = await searchSlackMessages({
            token: env.slack_token,
            query: env.slack_query,
            page,
            count: perPage,
        });

        const matches = response.messages.matches;
        if (matches.length === 0) break;

        for (const match of matches) {
            if (cachedTsSet.has(match.ts)) {
                continue;
            }

            const unixTimeMs = tsToUnixTimeMs(match.ts);

            if (lastRecord && unixTimeMs <= lastRecord.unixTimeMs) {
                shouldStop = true;
                break;
            }

            allRecords.push({
                type: SlackType,
                text: match.text,
                channel: match.channel.name,
                channelId: match.channel.id,
                username: match.username,
                userId: match.user,
                permalink: match.permalink,
                team: match.team,
                ts: match.ts,
                iid: match.iid,
                url: match.permalink,
                unixTimeMs,
            });

            if (allRecords.length >= options.limit) {
                shouldStop = true;
                break;
            }
        }

        if (page >= response.messages.paging.pages) break;
    }

    logger.info("total new records: %d", allRecords.length);

    const newCacheItems = allRecords.map((record) => ({ ts: record.ts }));
    await cache.merge(newCacheItems);

    return allRecords;
};

export const slackService: ServiceDefinition = {
    writeMode: "append",
    isEnv: isSlackEnv,
    fetch: (env, lastRecord, options) => fetchSlack(env, lastRecord, options),
};
