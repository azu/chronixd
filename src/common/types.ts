export type BaseRecord = {
    type: string;
    unixTimeMs: number;
    url?: string;
};

export type BlueskyRecord = BaseRecord & {
    type: "Bluesky";
    text: string;
    parentUrl?: string;
};

export type GitHubEventRecord = BaseRecord & {
    type: "GitHub";
    eventType: string;
    action?: string;
    repo: string;
    title?: string;
    body?: string;
    number?: number;
    state?: string;
};

export type GitHubSearchRecord = BaseRecord & {
    type: "GitHubSearch";
    resultType: "Repository" | "PullRequest" | "Issue";
    nameWithOwner: string;
    title?: string;
    state?: string;
    author?: string;
    number?: number;
};

export type CalendarRecord = BaseRecord & {
    type: "calendar";
    summary: string;
};

export type RssRecord = BaseRecord & {
    type: "RSS";
    title: string;
    link: string;
};

export type LinearRecord = BaseRecord & {
    type: "Linear";
    activityType: "assigned" | "created" | "comment" | "status_change" | "assign_change" | "priority_change";
    issueTitle: string;
    body?: string;
    fromState?: string;
    toState?: string;
    estimate?: number;
    identifier?: string;
    priority?: number;
    labels?: string[];
};

export type LocationRecord = BaseRecord & {
    type: "Location";
    latitude: number;
    longitude: number;
    altitude?: number;
    speed?: number;
    address?: string;
    poi?: string;
};

export type NotionPropertyValue = string | number | boolean | string[] | { start: string; end?: string };

export type NotionRecord = BaseRecord & {
    type: "Notion";
    pageId: string;
    title: string;
    properties: Record<string, NotionPropertyValue>;
};

export type AnyRecord =
    | BlueskyRecord
    | GitHubEventRecord
    | GitHubSearchRecord
    | CalendarRecord
    | RssRecord
    | LinearRecord
    | LocationRecord
    | NotionRecord;

export type ReplaceFilter = {
    type: string;
    sinceUnixTimeMs: number;
};

export type FetchOptions = {
    limit: number;
};

export type ServiceDefinition = {
    writeMode: "append";
    isEnv: (env: unknown) => boolean;
    fetch: (env: any, lastRecord: BaseRecord | null, options: FetchOptions) => Promise<BaseRecord[]>;
} | {
    writeMode: "replace";
    isEnv: (env: unknown) => boolean;
    fetch: (env: any, lastRecord: BaseRecord | null, options: FetchOptions) => Promise<{
        records: BaseRecord[];
        replaceFilter: ReplaceFilter;
    }>;
};
