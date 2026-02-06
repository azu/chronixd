import { BaseRecord, RssRecord } from "../common/types.js";
import Parser from 'rss-parser';
import { createCache } from "../common/cache.js";

export type RssEnv = {
    rss_url: string;
};
export const RSSType = "RSS" as const;
export const isRssEnv = (env: unknown): env is RssEnv => {
    return typeof (env as RssEnv).rss_url === "string";
}
type CacheItem = {
    id: string;
    unixTimeMs: number;
}
type FeedItem = {
    title: string;
    link: string;
    pubDate: Date;
}
const isFeedItem = (v: unknown): v is FeedItem => {
    return v !== null && typeof v === "object" && "pubDate" in v && "title" in v && "link" in v;
}
export const fetchRss = async (env: RssEnv, _lastRecord: BaseRecord | null): Promise<RssRecord[]> => {
    const parser = new Parser();
    const feed = await parser.parseURL(env.rss_url);
    const cache = createCache<CacheItem>("rss.json");
    const oldItems = await cache.read();
    const newItems = feed.items.filter(item => {
        if (!isFeedItem(item)) {
            return false;
        }
        const id = item.link;
        return !oldItems.find(oldItem => oldItem.id === id);
    })
    const newEvents = newItems.map(item => {
        return {
            id: item.link!,
            unixTimeMs: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        }
    }) as CacheItem[];
    await cache.merge(newEvents);
    return newItems.map(item => {
        if (!isFeedItem(item)) {
            throw new Error("invalid feed item");
        }
        return {
            type: RSSType,
            title: item.title,
            link: item.link,
            url: item.link,
            unixTimeMs: new Date(item.pubDate).getTime(),
        };
    });
}
