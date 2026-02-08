import { AsocialBookmark } from "asocial-bookmark";
import type { AsocialBookmarkItem } from "asocial-bookmark";
import { BaseRecord, BookmarkRecord, ServiceDefinition } from "../common/types.js";
import { info } from "../common/logger.js";

export type AsocialBookmarkEnv = {
    asocial_bookmark_owner: string;
    asocial_bookmark_repo: string;
    asocial_bookmark_token: string;
    asocial_bookmark_branch: string;
};
export const BookmarkType = "Bookmark" as const;
export const isAsocialBookmarkEnv = (env: unknown): env is AsocialBookmarkEnv => {
    return (
        typeof (env as AsocialBookmarkEnv).asocial_bookmark_owner === "string" &&
        typeof (env as AsocialBookmarkEnv).asocial_bookmark_repo === "string" &&
        typeof (env as AsocialBookmarkEnv).asocial_bookmark_token === "string" &&
        typeof (env as AsocialBookmarkEnv).asocial_bookmark_branch === "string"
    );
};

const toBookmarkRecord = (item: AsocialBookmarkItem): BookmarkRecord => {
    return {
        type: BookmarkType,
        unixTimeMs: new Date(item.date).getTime(),
        url: item.url,
        title: item.title,
        content: item.content,
        tags: item.tags,
        relatedItems: item.relatedItems ?? [],
    };
};

const getMonthDates = (): Date[] => {
    const now = new Date();
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return [previousMonth, currentMonth];
};

const fetchAsocialBookmark = async (
    env: AsocialBookmarkEnv,
    _lastRecord: BaseRecord | null,
): Promise<{
    records: BookmarkRecord[];
    replaceFilter: { type: string; sinceUnixTimeMs: number };
}> => {
    const branch = env.asocial_bookmark_branch;
    const bookmark = new AsocialBookmark({
        github: {
            owner: env.asocial_bookmark_owner,
            repo: env.asocial_bookmark_repo,
            ref: `heads/${branch}`,
            token: env.asocial_bookmark_token,
        },
    });
    const monthDates = getMonthDates();
    const allRecords: BookmarkRecord[] = [];
    for (const date of monthDates) {
        const items = await bookmark.getBookmarksAt(date);
        info("getBookmarksAt(%s): %d items", date.toISOString(), items.length);
        allRecords.push(...items.map(toBookmarkRecord));
    }
    return {
        records: allRecords,
        replaceFilter: {
            type: BookmarkType,
            sinceUnixTimeMs: monthDates[0].getTime(),
        },
    };
};

export const asocialBookmarkService: ServiceDefinition = {
    writeMode: "replace",
    isEnv: isAsocialBookmarkEnv,
    fetch: (env, lastRecord) => fetchAsocialBookmark(env, lastRecord),
};
