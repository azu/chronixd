import { BaseRecord, MicroblogRecord, ServiceDefinition } from "../common/types.js";
import { createLogger } from "../common/logger.js";
import { fetchWithRetry } from "../common/fetchWithRetry.js";

const logger = createLogger("Microblog");

export type MicroblogEnv = {
    microblog_endpoint: string;
    microblog_token: string;
};

export const MicroblogType = "Microblog" as const;

export const isMicroblogEnv = (env: unknown): env is MicroblogEnv => {
    if (typeof env !== "object" || env === null) {
        return false;
    }
    const e = env as Record<string, unknown>;
    return typeof e.microblog_endpoint === "string" && typeof e.microblog_token === "string";
};

export const fetchMicroblog = async (
    env: MicroblogEnv,
    lastRecord: BaseRecord | null
): Promise<MicroblogRecord[]> => {
    const url = new URL("/api/posts.ndjson", env.microblog_endpoint);
    if (lastRecord) {
        url.searchParams.set("since", String(lastRecord.unixTimeMs));
    }

    const response = await fetchWithRetry(url.toString(), {
        headers: {
            Authorization: `Bearer ${env.microblog_token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch microblog: ${response.status} ${response.statusText}`);
    }

    const body = await response.text();
    if (body.trim().length === 0) {
        logger.info("No new microblog posts");
        return [];
    }

    const records = body
        .trimEnd()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as MicroblogRecord);

    logger.info("Microblog records count", records.length);
    return records;
};

export const microblogService: ServiceDefinition = {
    writeMode: "append",
    isEnv: isMicroblogEnv,
    fetch: (env, lastRecord) => fetchMicroblog(env, lastRecord),
};
