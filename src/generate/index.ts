import { readAllRecords, groupByDay } from "./reader.js";
import { generateDayPages, generateIndexPage } from "./page-generator.js";
import { copyAssets } from "./assets.js";
import { runPagefind } from "./search.js";
import type { GenerateCliOptions } from "../cli.js";

const detectMicroblogEndpoint = (): string | null => {
    const envsRaw = process.env.CHRONIXD_ENVS;
    if (!envsRaw) return null;
    try {
        const envs = JSON.parse(envsRaw) as { type?: string; microblog_endpoint?: string }[];
        for (const env of envs) {
            if (env.type === "microblog" && env.microblog_endpoint) {
                return env.microblog_endpoint;
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
    const microblogEndpoint = detectMicroblogEndpoint();

    const generateOptions = {
        language: options.language,
        microblogEndpoint,
    };

    await generateDayPages(options.output, dayGroups, generateOptions);
    await generateIndexPage(options.output, dayGroups, generateOptions);
    await copyAssets(options.output);
    await runPagefind(options.output, options.language);
};
