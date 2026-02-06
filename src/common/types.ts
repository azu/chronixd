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

export type AnyRecord =
    | BlueskyRecord
    | GitHubEventRecord
    | GitHubSearchRecord
    | CalendarRecord
    | RssRecord
    | LinearRecord
    | LocationRecord;
