import { isBlueSkyEnv, BlueSkyEnv, BlueskyType } from "./services/bluesky.js";
import { isGithubEnv, GitHubEnv, GitHubType } from "./services/github.js";
import { isGitHubSearchEnv, GitHubSearchEnv, GitHubSearchType } from "./services/github_search.js";
import { isCalendarEnv, CalendarEnv, CalendarType } from "./services/calendar.js";
import { isRssEnv, RssEnv, RSSType } from "./services/rss.js";
import { isLinearEnv, LinearEnv, LinearType } from "./services/linear.js";
import { isLocationEnv, LocationEnv, LocationType } from "./services/location.js";
import { isNotionEnv, NotionEnv, NotionType } from "./services/notion.js";
import { isSlackEnv, SlackEnv, SlackType } from "./services/slack.js";
import { isAsocialBookmarkEnv, AsocialBookmarkEnv, BookmarkType } from "./services/asocial-bookmark.js";
import { isWakaTimeEnv, WakaTimeEnv, WakaTimeType } from "./services/wakatime.js";
import { isMicroblogEnv, MicroblogEnv, MicroblogType } from "./services/microblog.js";

export type SupportedEnv = (BlueSkyEnv | GitHubEnv | GitHubSearchEnv | CalendarEnv | RssEnv | LinearEnv | LocationEnv | NotionEnv | SlackEnv | AsocialBookmarkEnv | WakaTimeEnv | MicroblogEnv) & {
    name: string;
};

export const typeOfEnv = (env: SupportedEnv): string => {
    if (isBlueSkyEnv(env)) {
        return BlueskyType;
    } else if (isGithubEnv(env)) {
        return GitHubType;
    } else if (isGitHubSearchEnv(env)) {
        return GitHubSearchType;
    } else if (isCalendarEnv(env)) {
        return CalendarType;
    } else if (isRssEnv(env)) {
        return RSSType;
    } else if (isLinearEnv(env)) {
        return LinearType;
    } else if (isLocationEnv(env)) {
        return LocationType;
    } else if (isNotionEnv(env)) {
        return NotionType;
    } else if (isSlackEnv(env)) {
        return SlackType;
    } else if (isAsocialBookmarkEnv(env)) {
        return BookmarkType;
    } else if (isWakaTimeEnv(env)) {
        return WakaTimeType;
    } else if (isMicroblogEnv(env)) {
        return MicroblogType;
    }
    throw new Error("unknown env type");
};

export const parserEnvs = (): SupportedEnv[] => {
    const env = process.env.CHRONIXD_ENVS;
    if (!env) {
        throw new Error("env CHRONIXD_ENVS is not set or empty. Set CHRONIXD_ENVS to a JSON array of service configurations.");
    }
    let envs: SupportedEnv[];
    try {
        envs = JSON.parse(env) as SupportedEnv[];
    } catch {
        throw new Error(`env CHRONIXD_ENVS is not valid JSON: ${env.slice(0, 5)}...${env.slice(-5)}`);
    }
    if (!Array.isArray(envs)) {
        throw new Error("env CHRONIXD_ENVS must be a JSON array");
    }
    for (const e of envs) {
        if (typeof e.name !== "string" || e.name.length === 0) {
            throw new Error("env.name is required");
        }
    }
    return envs;
};
