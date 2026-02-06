import { fetchBluesky, isBlueSkyEnv } from "./services/bluesky.js";
import { parserEnvs, SupportedEnv, typeOfEnv } from "./envs.js";
import { BaseRecord } from "./common/types.js";
import { debug, info, warn } from "./common/logger.js";
import { fetchGitHubSearch, isGitHubSearchEnv } from "./services/github_search.js";
import { fetchGitHubEvents, isGithubEnv } from "./services/github.js";
import { RetryAbleError } from "./common/RetryAbleError.js";
import { RateLimitError } from "./common/RateLimitError.js";
import { fetchCalendar, isCalendarEnv } from "./services/calendar.js";
import { fetchRss, isRssEnv } from "./services/rss.js";
import { fetchLinear, isLinearEnv } from "./services/linear.ts";
import { fetchLocation, isLocationEnv } from "./services/location.js";
import { fetchNotion, fetchNotionSchema, isNotionEnv } from "./services/notion.js";
import { parseCli } from "./cli.js";
import { appendRecords } from "./writer/ndjson.js";
import { readLastRecord } from "./writer/lastItem.js";
import { writeServiceSchemas } from "./writer/schema.js";
import { SERVICE_DIR_MAP } from "./schema/definitions.js";

if (Boolean(process.env.CHRONIXD_DRY_RUN)) {
    info("DRY_RUN mode");
}

const getServiceDir = (envType: string): string => {
    return SERVICE_DIR_MAP[envType] ?? envType.toLowerCase();
};

const fetchService = async (env: SupportedEnv, lastRecord: BaseRecord | null): Promise<BaseRecord[]> => {
    try {
        if (isBlueSkyEnv(env)) {
            return await fetchBluesky(env, lastRecord as Parameters<typeof fetchBluesky>[1]);
        } else if (isGithubEnv(env)) {
            return await fetchGitHubEvents(env, lastRecord);
        } else if (isGitHubSearchEnv(env)) {
            return await fetchGitHubSearch(env, lastRecord);
        } else if (isCalendarEnv(env)) {
            return await fetchCalendar(env, lastRecord);
        } else if (isRssEnv(env)) {
            return await fetchRss(env, lastRecord);
        } else if (isLinearEnv(env)) {
            return await fetchLinear(env, lastRecord);
        } else if (isLocationEnv(env)) {
            return await fetchLocation(env, lastRecord);
        } else if (isNotionEnv(env)) {
            return await fetchNotion(env, lastRecord);
        }
    } catch (error) {
        if (error instanceof RetryAbleError) {
            info("retryable error", error.message);
            return fetchService(env, lastRecord);
        } else if (error instanceof RateLimitError) {
            warn("rate limit error", error.message);
            warn("treat rate limit error as success");
            return [];
        }
        throw error;
    }
    throw new Error("unsupported env");
};

const cliOptions = parseCli();
const envs = parserEnvs();

// Collect dynamic schema from Notion data sources
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
await writeServiceSchemas(cliOptions.output, extraColumns);
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

    const records = await fetchService(env, lastRecord);
    info("env:%s, new records count: %d", envType, records.length);
    await appendRecords(
        { outputDir: cliOptions.output, name: env.name, service: serviceDir },
        records
    );
}
