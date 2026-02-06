import { AppBskyFeedGetAuthorFeed, BskyAgent } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { BlueskyRecord } from "../common/types.js";
import { createLogger } from "../common/logger.js";

const logger = createLogger("Bluesky");
export type BlueSkyEnv = {
    bluesky_identifier: string;
    bluesky_app_password: string;
};
export const BlueskyType = "Bluesky" as const;
export const isBlueSkyEnv = (env: unknown): env is BlueSkyEnv => {
    return (env as BlueSkyEnv).bluesky_identifier !== undefined && (env as BlueSkyEnv).bluesky_app_password !== undefined;
}
const convertHttpUrlFromAtProto = (url: string): string => {
    const match = url.match(/at:\/\/(did:plc:.*?)\/app.bsky.feed.post\/(.*)/);
    if (match === null) {
        throw new Error(`post.uri is invalid: ${url}`);
    }
    const did = match[1];
    const contentId = match[2];
    return `https://bsky.app/profile/${did}/post/${contentId}`
}
const getRootPost = (post: PostView): { url: string; } | undefined => {
    // @ts-expect-error no reply type
    if (!post.record?.reply?.root) {
        return undefined;
    }
    // @ts-expect-error no reply type
    const url = convertHttpUrlFromAtProto(post.record.reply.root.uri);
    return {
        url,
    }
}
export const convertPostToBlueskyRecord = (post: PostView, identifier: string): BlueskyRecord => {
    const record = post.record as { text?: string };
    if (typeof record.text !== "string") {
        throw new Error("post.record.text is not string");
    }
    const rootPost = getRootPost(post);
    return {
        type: BlueskyType,
        text: record.text,
        url: convertHttpUrlFromAtProto(post.uri),
        unixTimeMs: new Date(post.indexedAt).getTime(),
        ...(rootPost ? { parentUrl: rootPost.url } : {}),
    };
};

type Feed = AppBskyFeedGetAuthorFeed.Response["data"]["feed"];
export const collectTweetsUntil = async (timeline: BlueskyRecord[], lastRecord: BlueskyRecord): Promise<BlueskyRecord[]> => {
    const results: BlueskyRecord[] = [];
    try {
        for (const tweet of timeline) {
            if (lastRecord.url === tweet.url) {
                return results;
            }
            if (lastRecord.unixTimeMs < tweet.unixTimeMs) {
                results.push(tweet);
            } else {
                return results;
            }
        }
    } catch (error) {
        logger.error(new Error("collect error", {
            cause: error,
        }));
        throw new Error("collect error at bluesky");
    }
    return results;
};

export async function fetchBluesky(env: BlueSkyEnv, lastRecord: BlueskyRecord | null): Promise<BlueskyRecord[]> {
    const agent = new BskyAgent({
        service: "https://bsky.social"
    });
    if (!env.bluesky_identifier || !env.bluesky_app_password) {
        throw new Error("bluesky_identifier or bluesky_app_password is not set");
    }
    await agent.login({
        identifier: env.bluesky_identifier,
        password: env.bluesky_app_password
    }).catch((error) => {
        logger.error("login error", {
            status: error.status,
            error: error.error,
            rateLimitHeaders: Object.fromEntries(Object.entries(error.headers).filter(([key]) => {
                return key.startsWith("ratelimit-")
            })),
        });
        throw error;
    });

    type FetchAuthorFeedParams = {
        actor: string;
        feed: Feed;
        cursor?: string;
    };
    const fetchAuthorFeed = async ({ actor, feed, cursor }: FetchAuthorFeedParams): Promise<Feed> => {
        try {
            const timeline = await agent.getAuthorFeed({
                actor,
                limit: 50,
                cursor
            });

            if (timeline.success) {
                const latestPost = timeline.data.feed.at(-1);
                if (lastRecord && latestPost) {
                    const lastItemDate = new Date(latestPost?.post?.indexedAt ?? "");
                    if (lastItemDate.getTime() < lastRecord.unixTimeMs) {
                        return [...feed, ...timeline.data.feed];
                    }
                }
                return [...feed, ...timeline.data.feed];
            } else {
                throw new Error("timeline fetch error:" + JSON.stringify(timeline.data));
            }
        } catch (error) {
            logger.debug("fetch error", {
                // @ts-ignore
                status: error.status,
                // @ts-ignore
                code: error.code,
            });
            throw error;
        }
    };

    logger.info("fetching from bluesky since %s", lastRecord?.unixTimeMs !== undefined
        ? new Date(lastRecord.unixTimeMs).toISOString()
        : "first");
    const feed = await fetchAuthorFeed({
        actor: env.bluesky_identifier,
        feed: []
    });
    const convertedPosts = feed.map((post) => {
        return convertPostToBlueskyRecord(post.post, env.bluesky_identifier);
    })
    const sortedPosts = convertedPosts.sort((a, b) => {
        return a.unixTimeMs > b.unixTimeMs ? -1 : 1;
    });
    logger.info("fetched item count", sortedPosts.length);
    const postItems = lastRecord ? await collectTweetsUntil(sortedPosts, lastRecord) : sortedPosts;
    logger.info("post-able items count", postItems.length);
    return postItems;
}
