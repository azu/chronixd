import { parserEnvs, SupportedEnv, typeOfEnv } from "./envs.js";
import { ServiceDefinition } from "./common/types.js";
import { debug, info, warn } from "./common/logger.js";
import { RetryAbleError } from "./common/RetryAbleError.js";
import { RateLimitError } from "./common/RateLimitError.js";
import { blueskyService } from "./services/bluesky.js";
import { githubService } from "./services/github.js";
import { githubSearchService } from "./services/github_search.js";
import { calendarService } from "./services/calendar.js";
import { rssService } from "./services/rss.js";
import { linearService } from "./services/linear.ts";
import { locationService } from "./services/location.js";
import { notionService, fetchNotionSchema, isNotionEnv } from "./services/notion.js";
import { slackService } from "./services/slack.js";
import { asocialBookmarkService } from "./services/asocial-bookmark.js";
import { parseCli } from "./cli.js";
import { appendRecords, replaceRecords } from "./writer/ndjson.js";
import { readLastRecord } from "./writer/lastItem.js";
import { writeServiceSchemas } from "./writer/schema.js";
import { SERVICE_DIR_MAP } from "./schema/definitions.js";

if (Boolean(process.env.CHRONIXD_DRY_RUN)) {
    info("DRY_RUN mode");
}

const getServiceDir = (envType: string): string => {
    return SERVICE_DIR_MAP[envType] ?? envType.toLowerCase();
};

const services: ServiceDefinition[] = [
    blueskyService,
    githubService,
    githubSearchService,
    calendarService,
    rssService,
    linearService,
    locationService,
    notionService,
    slackService,
    asocialBookmarkService,
];

const findService = (env: SupportedEnv): ServiceDefinition => {
    const service = services.find((s) => s.isEnv(env));
    if (!service) {
        throw new Error("unsupported env");
    }
    return service;
};

const cliOptions = parseCli();
const envs = parserEnvs();

// Collect active services and dynamic schema
const activeServiceDirs = new Set(envs.map((env) => getServiceDir(typeOfEnv(env))));
const extraColumns: { serviceDir: string; columns: Record<string, import("./schema/definitions.js").ColumnSchema> }[] = [];
for (const env of envs) {
    if (isNotionEnv(env)) {
        try {
            const columns = await fetchNotionSchema(env);
            extraColumns.push({ serviceDir: "notion", columns });
        } catch (e) {
            warn("Failed to fetch Notion schema for %s: %s", env.name, (e as Error).message);
        }
    }
}
await writeServiceSchemas(cliOptions.output, { activeServiceDirs, extraColumns });
for (const env of envs) {
    const envType = typeOfEnv(env);
    const serviceDir = getServiceDir(envType);
    const lastRecord = await readLastRecord({
        outputDir: cliOptions.output,
        name: env.name,
        service: serviceDir,
    });
    if (lastRecord?.unixTimeMs) {
        info("env:%s, last record exists at %s", envType, new Date(lastRecord.unixTimeMs).toISOString());
    } else {
        info("env:%s, last record not exists", envType);
    }
    debug("env:%s, lastRecord object", envType, lastRecord);

    const service = findService(env);
    const writeOptions = { outputDir: cliOptions.output, name: env.name, service: serviceDir };
    try {
        if (service.writeMode === "replace") {
            const result = await service.fetch(env, lastRecord, { limit: cliOptions.limit });
            info("env:%s, new records count: %d", envType, result.records.length);
            await replaceRecords(writeOptions, result.records, result.replaceFilter);
        } else {
            const records = await service.fetch(env, lastRecord, { limit: cliOptions.limit });
            info("env:%s, new records count: %d", envType, records.length);
            await appendRecords(writeOptions, records);
        }
    } catch (error) {
        if (error instanceof RetryAbleError) {
            info("retryable error", error.message);
            if (service.writeMode === "replace") {
                const result = await service.fetch(env, lastRecord, { limit: cliOptions.limit });
                info("env:%s, new records count: %d", envType, result.records.length);
                await replaceRecords(writeOptions, result.records, result.replaceFilter);
            } else {
                const records = await service.fetch(env, lastRecord, { limit: cliOptions.limit });
                info("env:%s, new records count: %d", envType, records.length);
                await appendRecords(writeOptions, records);
            }
        } else if (error instanceof RateLimitError) {
            warn("rate limit error", error.message);
            warn("treat rate limit error as success");
        } else {
            throw error;
        }
    }
}
