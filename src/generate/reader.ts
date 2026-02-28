import * as fs from "fs/promises";
import * as path from "path";
import { readNdjsonFile } from "../writer/ndjson.js";
import type { BaseRecord } from "../common/types.js";

export type TimelineEntry = BaseRecord & {
    service: string;
    sourceName: string;
    [key: string]: unknown;
};

export type DayGroup = {
    dateKey: string; // "2026-02-28"
    year: number;
    month: number;
    day: number;
    entries: TimelineEntry[];
};

const walkNdjsonFiles = async (dir: string): Promise<{ filePath: string; service: string; sourceName: string }[]> => {
    const results: { filePath: string; service: string; sourceName: string }[] = [];
    let services: string[];
    try {
        services = await fs.readdir(dir);
    } catch {
        return results;
    }
    for (const service of services) {
        const servicePath = path.join(dir, service);
        const stat = await fs.stat(servicePath);
        if (!stat.isDirectory()) continue;

        const names = await fs.readdir(servicePath);
        for (const name of names) {
            const namePath = path.join(servicePath, name);
            const nameStat = await fs.stat(namePath);
            if (!nameStat.isDirectory()) continue;

            const years = await fs.readdir(namePath);
            for (const year of years) {
                const yearPath = path.join(namePath, year);
                const yearStat = await fs.stat(yearPath);
                if (!yearStat.isDirectory()) continue;

                const files = await fs.readdir(yearPath);
                for (const file of files) {
                    if (!file.endsWith(".ndjson")) continue;
                    results.push({
                        filePath: path.join(yearPath, file),
                        service,
                        sourceName: name,
                    });
                }
            }
        }
    }
    return results;
};

export const readAllRecords = async (inputDir: string): Promise<TimelineEntry[]> => {
    const files = await walkNdjsonFiles(inputDir);
    const allEntries: TimelineEntry[] = [];

    for (const { filePath, service, sourceName } of files) {
        const records = await readNdjsonFile(filePath);
        for (const record of records) {
            allEntries.push({
                ...record,
                service,
                sourceName,
            });
        }
    }

    return allEntries;
};

export const groupByDay = (records: TimelineEntry[]): DayGroup[] => {
    const dayMap = new Map<string, TimelineEntry[]>();

    for (const record of records) {
        const date = new Date(record.unixTimeMs);
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const existing = dayMap.get(dateKey);
        if (existing) {
            existing.push(record);
        } else {
            dayMap.set(dateKey, [record]);
        }
    }

    const dayGroups: DayGroup[] = [];
    for (const [dateKey, entries] of dayMap) {
        const [year, month, day] = dateKey.split("-").map(Number);
        // Sort entries within a day by time descending (newest first)
        entries.sort((a, b) => b.unixTimeMs - a.unixTimeMs);
        dayGroups.push({ dateKey, year, month, day, entries });
    }

    // Sort day groups by date descending (newest first)
    dayGroups.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    return dayGroups;
};
