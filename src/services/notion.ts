import { Client } from "@notionhq/client";
import type { PageObjectResponse, DataSourceObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { BaseRecord, NotionRecord, NotionPropertyValue, ServiceDefinition } from "../common/types.js";
import { createCache } from "../common/cache.js";
import { createLogger } from "../common/logger.js";
import type { ColumnSchema } from "../schema/definitions.js";

const logger = createLogger("Notion");

export type NotionEnv = {
    notion_token: string;
    notion_data_source_id: string;
};
export const NotionType = "Notion" as const;

export const isNotionEnv = (env: unknown): env is NotionEnv => {
    if (env === null || typeof env !== "object") {
        return false;
    }
    return typeof (env as NotionEnv).notion_token === "string" && typeof (env as NotionEnv).notion_data_source_id === "string";
};

type PropertyValue = PageObjectResponse["properties"][string];

export const extractPropertyValue = (prop: PropertyValue): NotionPropertyValue | undefined => {
    switch (prop.type) {
        case "title":
            return prop.title.map((t) => t.plain_text).join("");
        case "rich_text":
            return prop.rich_text.map((t) => t.plain_text).join("");
        case "number":
            return prop.number ?? undefined;
        case "select":
            return prop.select?.name ?? undefined;
        case "multi_select":
            return prop.multi_select.map((s) => s.name);
        case "status":
            return prop.status?.name ?? undefined;
        case "date": {
            if (prop.date === null) {
                return undefined;
            }
            if (prop.date.end) {
                return { start: prop.date.start, end: prop.date.end };
            }
            return { start: prop.date.start };
        }
        case "checkbox":
            return prop.checkbox;
        case "url":
            return prop.url ?? undefined;
        case "email":
            return prop.email ?? undefined;
        case "phone_number":
            return prop.phone_number ?? undefined;
        case "formula": {
            switch (prop.formula.type) {
                case "string":
                    return prop.formula.string ?? undefined;
                case "number":
                    return prop.formula.number ?? undefined;
                case "boolean":
                    return prop.formula.boolean ?? undefined;
                case "date": {
                    if (prop.formula.date === null) {
                        return undefined;
                    }
                    if (prop.formula.date.end) {
                        return { start: prop.formula.date.start, end: prop.formula.date.end };
                    }
                    return { start: prop.formula.date.start };
                }
                default:
                    return undefined;
            }
        }
        case "relation":
            return prop.relation.map((r) => r.id);
        case "created_time":
            return prop.created_time;
        case "last_edited_time":
            return prop.last_edited_time;
        case "files":
            return prop.files.map((f) => {
                if (f.type === "file") {
                    return f.file.url;
                }
                return f.external.url;
            });
        default:
            return undefined;
    }
};

const extractTitle = (properties: PageObjectResponse["properties"]): string => {
    for (const prop of Object.values(properties)) {
        if (prop.type === "title") {
            return prop.title.map((t) => t.plain_text).join("");
        }
    }
    return "";
};

const convertPageToRecord = (page: PageObjectResponse): NotionRecord => {
    const properties: Record<string, NotionPropertyValue> = {};
    for (const [key, prop] of Object.entries(page.properties)) {
        const value = extractPropertyValue(prop);
        if (value !== undefined) {
            properties[key] = value;
        }
    }
    return {
        type: NotionType,
        pageId: page.id,
        title: extractTitle(page.properties),
        url: page.url,
        unixTimeMs: new Date(page.last_edited_time).getTime(),
        properties,
    };
};

type CacheItem = {
    pageId: string;
    unixTimeMs: number;
};

export const fetchNotion = async (env: NotionEnv, lastRecord: BaseRecord | null, options?: { limit?: number }): Promise<NotionRecord[]> => {
    const maxPages = options?.limit ?? 1000;
    const client = new Client({ auth: env.notion_token });
    const cache = createCache<CacheItem>("notion.json", { maxItems: 10000 });
    const oldItems = await cache.read();

    const filter = lastRecord
        ? {
              timestamp: "last_edited_time" as const,
              last_edited_time: {
                  after: new Date(lastRecord.unixTimeMs).toISOString(),
              },
          }
        : undefined;

    logger.info(
        "fetching from notion since %s",
        lastRecord ? new Date(lastRecord.unixTimeMs).toISOString() : "first"
    );

    const pages: PageObjectResponse[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore && pages.length < maxPages) {
        const response = await client.dataSources.query({
            data_source_id: env.notion_data_source_id,
            page_size: 100,
            sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
            ...(filter ? { filter } : {}),
            ...(startCursor ? { start_cursor: startCursor } : {}),
        });
        for (const result of response.results) {
            if ("properties" in result && result.object === "page") {
                pages.push(result as PageObjectResponse);
            }
        }
        hasMore = response.has_more;
        startCursor = response.next_cursor ?? undefined;
    }

    if (hasMore && pages.length >= maxPages) {
        logger.info("reached limit of %d pages, skipping remaining", maxPages);
    }

    const newPages = pages.filter((page) => {
        return !oldItems.some((item) => item.pageId === page.id);
    });

    logger.info("fetched item count: %d, new items: %d", pages.length, newPages.length);

    const newCacheItems = newPages.map((page) => ({
        pageId: page.id,
        unixTimeMs: new Date(page.last_edited_time).getTime(),
    }));
    await cache.merge(newCacheItems);

    return newPages.map(convertPageToRecord);
};

type NotionPropertyType = DataSourceObjectResponse["properties"][string]["type"];

const notionTypeToDuckDB = (notionType: NotionPropertyType): ColumnSchema | undefined => {
    switch (notionType) {
        case "title":
        case "rich_text":
        case "select":
        case "status":
        case "url":
        case "email":
        case "phone_number":
        case "created_time":
        case "last_edited_time":
            return { type: "VARCHAR", description: `Notion ${notionType} property` };
        case "number":
            return { type: "DOUBLE", description: "Notion number property" };
        case "checkbox":
            return { type: "VARCHAR", description: "Notion checkbox property (true/false)" };
        case "date":
            return { type: "VARCHAR", description: "Notion date property as JSON {start, end?}. end is omitted when not set (json_extract for end returns NULL)" };
        case "multi_select":
        case "relation":
        case "files":
            return { type: "VARCHAR[]", description: `Notion ${notionType} property (array)` };
        case "formula":
            return { type: "VARCHAR", description: "Notion formula property (type varies)" };
        default:
            return undefined;
    }
};

export const fetchNotionSchema = async (env: NotionEnv): Promise<Record<string, ColumnSchema>> => {
    const client = new Client({ auth: env.notion_token });
    const response = await client.dataSources.retrieve({
        data_source_id: env.notion_data_source_id,
    });
    if (response.object !== "data_source") {
        return {};
    }
    const dataSource = response as DataSourceObjectResponse;
    const propertyColumns: Record<string, ColumnSchema> = {};
    for (const [name, config] of Object.entries(dataSource.properties)) {
        const col = notionTypeToDuckDB(config.type);
        if (col) {
            const query = config.type === "date"
                ? `json_extract(properties, '$.${name}.start')::DATE, json_extract(properties, '$.${name}.end')::DATE`
                : `json_extract(properties, '$.${name}')`;
            propertyColumns[`properties.${name}`] = {
                ...col,
                description: `${col.description} — ${query}`,
                nullable: true,
            };
        }
    }
    return propertyColumns;
};

export const notionService: ServiceDefinition = {
    writeMode: "append",
    isEnv: isNotionEnv,
    fetch: (env, lastRecord, options) => fetchNotion(env, lastRecord, { limit: options.limit }),
};
