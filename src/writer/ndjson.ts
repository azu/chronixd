import * as fs from "fs/promises";
import * as path from "path";
import { BaseRecord } from "../common/types.js";
import { debug, info } from "../common/logger.js";

export type WriteOptions = {
    outputDir: string;
    name: string;
    service: string;
};

const getYearMonth = (unixTimeMs: number): { year: string; month: string } => {
    const date = new Date(unixTimeMs);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return { year, month };
};

export const appendRecords = async (options: WriteOptions, records: BaseRecord[]): Promise<void> => {
    const isDryRun = Boolean(process.env.CHRONIXD_DRY_RUN);
    if (records.length === 0) {
        return;
    }
    const sorted = records.toSorted((a, b) => a.unixTimeMs - b.unixTimeMs);
    // Group by year/month
    const groups = new Map<string, BaseRecord[]>();
    for (const record of sorted) {
        const { year, month } = getYearMonth(record.unixTimeMs);
        const key = `${year}/${month}`;
        const group = groups.get(key);
        if (group) {
            group.push(record);
        } else {
            groups.set(key, [record]);
        }
    }
    for (const [key, groupRecords] of groups) {
        const [year, month] = key.split("/");
        const dir = path.join(options.outputDir, options.service, options.name, year);
        const filePath = path.join(dir, `${month}.ndjson`);
        const lines = groupRecords.map((r) => JSON.stringify(r)).join("\n") + "\n";
        if (isDryRun) {
            info(`[DRY_RUN] would append ${groupRecords.length} records to ${filePath}`);
            debug("[DRY_RUN] records", groupRecords);
            continue;
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.appendFile(filePath, lines, "utf-8");
        info(`appended ${groupRecords.length} records to ${filePath}`);
    }
};
