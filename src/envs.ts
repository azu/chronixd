import { isBlueSkyEnv, BlueSkyEnv, BlueskyType } from "./services/bluesky.js";
import { isGithubEnv, GitHubEnv, GitHubType } from "./services/github.js";
import { isGitHubSearchEnv, GitHubSearchEnv, GitHubSearchType } from "./services/github_search.js";
import { isCalendarEnv, CalendarEnv, CalendarType } from "./services/calendar.js";
import { isRssEnv, RssEnv, RSSType } from "./services/rss.js";
import { isLinearEnv, LinearEnv, LinearType } from "./services/linear.js";
import { isLocationEnv, LocationEnv, LocationType } from "./services/location.js";
import { isNotionEnv, NotionEnv, NotionType } from "./services/notion.js";

export type SupportedEnv = (BlueSkyEnv | GitHubEnv | GitHubSearchEnv | CalendarEnv | RssEnv | LinearEnv | LocationEnv | NotionEnv) & {
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
    }
    throw new Error("unknown env type");
};

export const parserEnvs = (): SupportedEnv[] => {
    const env = process.env.CHRONIXD_ENVS;
    if (env === undefined) {
        throw new Error("env CHRONIXD_ENVS is undefined");
    }
    const envs = JSON.parse(env) as SupportedEnv[];
    for (const e of envs) {
        if (typeof e.name !== "string" || e.name.length === 0) {
            throw new Error("env.name is required");
        }
    }
    return envs;
};
