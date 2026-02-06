type DuckDBType = "VARCHAR" | "BIGINT" | "DOUBLE" | "INTEGER" | "VARCHAR[]";

type ColumnSchema = {
    type: DuckDBType;
    description: string;
    nullable?: boolean;
    enum?: string[];
};

type ServiceSchemaDefinition = {
    recordType: string;
    serviceDir: string;
    description: string;
    columns: Record<string, ColumnSchema>;
};

export const SCHEMA_DEFINITIONS: ServiceSchemaDefinition[] = [
    {
        recordType: "Bluesky",
        serviceDir: "bluesky",
        description: "Bluesky posts and reposts",
        columns: {
            type: { type: "VARCHAR", enum: ["Bluesky"], description: "Record type" },
            unixTimeMs: { type: "BIGINT", description: "Unix timestamp in milliseconds" },
            url: { type: "VARCHAR", nullable: true, description: "Post URL" },
            text: { type: "VARCHAR", description: "Post text content" },
            parentUrl: { type: "VARCHAR", nullable: true, description: "Parent post URL for replies" },
        },
    },
    {
        recordType: "GitHub",
        serviceDir: "github-events",
        description: "GitHub user activity events",
        columns: {
            type: { type: "VARCHAR", enum: ["GitHub"], description: "Record type" },
            unixTimeMs: { type: "BIGINT", description: "Unix timestamp in milliseconds" },
            url: { type: "VARCHAR", nullable: true, description: "Event URL" },
            eventType: { type: "VARCHAR", description: "GitHub event type (PushEvent, PullRequestEvent, etc.)" },
            repo: { type: "VARCHAR", description: "Repository full name" },
            action: { type: "VARCHAR", nullable: true, description: "Event action" },
            title: { type: "VARCHAR", nullable: true, description: "Issue or PR title" },
            body: { type: "VARCHAR", nullable: true, description: "Issue or PR body" },
            number: { type: "INTEGER", nullable: true, description: "Issue or PR number" },
            state: { type: "VARCHAR", nullable: true, description: "Issue or PR state" },
        },
    },
    {
        recordType: "GitHubSearch",
        serviceDir: "github-search",
        description: "GitHub search results",
        columns: {
            type: { type: "VARCHAR", enum: ["GitHubSearch"], description: "Record type" },
            unixTimeMs: { type: "BIGINT", description: "Unix timestamp in milliseconds" },
            url: { type: "VARCHAR", nullable: true, description: "Result URL" },
            resultType: { type: "VARCHAR", enum: ["Repository", "PullRequest", "Issue"], description: "Search result type" },
            nameWithOwner: { type: "VARCHAR", description: "Repository name with owner" },
            title: { type: "VARCHAR", nullable: true, description: "Issue or PR title" },
            state: { type: "VARCHAR", nullable: true, description: "Issue or PR state" },
            author: { type: "VARCHAR", nullable: true, description: "Author login" },
            number: { type: "INTEGER", nullable: true, description: "Issue or PR number" },
        },
    },
    {
        recordType: "calendar",
        serviceDir: "calendar",
        description: "Calendar events from iCal feeds",
        columns: {
            type: { type: "VARCHAR", enum: ["calendar"], description: "Record type" },
            unixTimeMs: { type: "BIGINT", description: "Unix timestamp in milliseconds" },
            url: { type: "VARCHAR", nullable: true, description: "Event URL" },
            summary: { type: "VARCHAR", description: "Event summary" },
        },
    },
    {
        recordType: "RSS",
        serviceDir: "rss",
        description: "RSS feed entries",
        columns: {
            type: { type: "VARCHAR", enum: ["RSS"], description: "Record type" },
            unixTimeMs: { type: "BIGINT", description: "Unix timestamp in milliseconds" },
            url: { type: "VARCHAR", nullable: true, description: "Entry URL" },
            title: { type: "VARCHAR", description: "Entry title" },
            link: { type: "VARCHAR", description: "Entry link" },
        },
    },
    {
        recordType: "Linear",
        serviceDir: "linear",
        description: "Linear issue activity",
        columns: {
            type: { type: "VARCHAR", enum: ["Linear"], description: "Record type" },
            unixTimeMs: { type: "BIGINT", description: "Unix timestamp in milliseconds" },
            url: { type: "VARCHAR", nullable: true, description: "Issue URL" },
            activityType: { type: "VARCHAR", enum: ["assigned", "created", "comment", "status_change", "assign_change", "priority_change"], description: "Activity type" },
            issueTitle: { type: "VARCHAR", description: "Issue title" },
            body: { type: "VARCHAR", nullable: true, description: "Comment or description body" },
            fromState: { type: "VARCHAR", nullable: true, description: "Previous state" },
            toState: { type: "VARCHAR", nullable: true, description: "New state" },
            estimate: { type: "DOUBLE", nullable: true, description: "Issue estimate" },
            identifier: { type: "VARCHAR", nullable: true, description: "Issue identifier" },
            priority: { type: "INTEGER", nullable: true, description: "Priority level" },
            labels: { type: "VARCHAR[]", nullable: true, description: "Issue labels" },
        },
    },
    {
        recordType: "Location",
        serviceDir: "location",
        description: "Device location data",
        columns: {
            type: { type: "VARCHAR", enum: ["Location"], description: "Record type" },
            unixTimeMs: { type: "BIGINT", description: "Unix timestamp in milliseconds" },
            url: { type: "VARCHAR", nullable: true, description: "URL" },
            latitude: { type: "DOUBLE", description: "Latitude" },
            longitude: { type: "DOUBLE", description: "Longitude" },
            altitude: { type: "DOUBLE", nullable: true, description: "Altitude in meters" },
            speed: { type: "DOUBLE", nullable: true, description: "Speed" },
            address: { type: "VARCHAR", nullable: true, description: "Reverse geocoded address" },
            poi: { type: "VARCHAR", nullable: true, description: "Point of interest" },
        },
    },
];

export const SERVICE_DIR_MAP: Record<string, string> = Object.fromEntries(
    SCHEMA_DEFINITIONS.map((def) => [def.recordType, def.serviceDir])
);
