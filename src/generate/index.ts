import { readAllRecords, groupByDay } from "./reader.js";
import { generateDayPages, generateIndexPage } from "./page-generator.js";
import { copyAssets } from "./assets.js";
import { runPagefind } from "./search.js";
import type { GenerateCliOptions } from "../cli.js";

type MicroblogConfig = {
    endpoint: string;
    token: string;
} | null;

const detectMicroblogConfig = (): MicroblogConfig => {
    const envsRaw = process.env.CHRONIXD_ENVS;
    if (!envsRaw) return null;
    try {
        const envs = JSON.parse(envsRaw) as { microblog_endpoint?: string; microblog_token?: string }[];
        for (const env of envs) {
            if (env.microblog_endpoint && env.microblog_token) {
                return { endpoint: env.microblog_endpoint, token: env.microblog_token };
            }
        }
    } catch {
        // ignore parse errors
    }
    return null;
};

export const runGenerate = async (options: GenerateCliOptions): Promise<void> => {
    const records = await readAllRecords(options.input);
    const dayGroups = groupByDay(records);
    const microblogConfig = detectMicroblogConfig();

    const generateOptions = {
        language: options.language,
        microblogEndpoint: microblogConfig?.endpoint ?? null,
        microblogToken: microblogConfig?.token ?? null,
    };

    await generateDayPages(options.output, dayGroups, generateOptions);
    await generateIndexPage(options.output, dayGroups, generateOptions);
    await copyAssets(options.output);
    await runPagefind(options.output, options.language);
};
