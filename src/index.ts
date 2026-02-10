import { parserEnvs, SupportedEnv, typeOfEnv } from "./envs.js";
import { ServiceDefinition } from "./common/types.js";
import { debug, errorLog, info, warn } from "./common/logger.js";
import { runWithLogBuffer } from "./common/buffered-logger.js";
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
import { wakatimeService } from "./services/wakatime.js";
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
    wakatimeService,
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

const processEnv = async (env: SupportedEnv): Promise<void> => {
    const envType = typeOfEnv(env);
    const serviceDir = getServiceDir(envType);
    const label = `${envType}/${env.name}`;

    await runWithLogBuffer(label, async () => {
        const lastRecord = await readLastRecord({
            outputDir: cliOptions.output,
            name: env.name,
            service: serviceDir,
        });
        if (lastRecord?.unixTimeMs) {
            info("last record exists at %s", new Date(lastRecord.unixTimeMs).toISOString());
        } else {
            info("last record not exists");
        }
        debug("lastRecord object", lastRecord);

        const service = findService(env);
        const writeOptions = { outputDir: cliOptions.output, name: env.name, service: serviceDir };

        const executeFetch = async () => {
            if (service.writeMode === "replace") {
                const result = await service.fetch(env, lastRecord, { limit: cliOptions.limit });
                info("new records count: %d", result.records.length);
                await replaceRecords(writeOptions, result.records, result.replaceFilter);
            } else {
                const records = await service.fetch(env, lastRecord, { limit: cliOptions.limit });
                info("new records count: %d", records.length);
                await appendRecords(writeOptions, records);
            }
        };

        const isRetryableError = (error: unknown): boolean => {
            if (error instanceof RetryAbleError) return true;
            if (error instanceof TypeError) return true;
            return false;
        };

        try {
            await executeFetch();
        } catch (error) {
            if (error instanceof RateLimitError) {
                warn("rate limit error", error.message);
                warn("treat rate limit error as success");
            } else if (isRetryableError(error)) {
                info("retryable error, retrying: %s", (error as Error).message);
                await executeFetch();
            } else {
                throw error;
            }
        }
    });
};

// Group envs by service type: same type runs sequentially (cache safety), different types run in parallel
const envsByType = new Map<string, SupportedEnv[]>();
for (const env of envs) {
    const envType = typeOfEnv(env);
    const existing = envsByType.get(envType) ?? [];
    existing.push(env);
    envsByType.set(envType, existing);
}

const groupResults = await Promise.allSettled(
    [...envsByType.values()].map(async (groupEnvs) => {
        for (const env of groupEnvs) {
            await processEnv(env);
        }
    })
);

const failures: string[] = [];
for (const [i, result] of groupResults.entries()) {
    if (result.status === "rejected") {
        const groupEnvs = [...envsByType.values()][i];
        const envType = typeOfEnv(groupEnvs[0]);
        errorLog("FAILED: %s: %s", envType, result.reason);
        failures.push(envType);
    }
}
if (failures.length > 0) {
    throw new Error(`Failed services: ${failures.join(", ")}`);
}
