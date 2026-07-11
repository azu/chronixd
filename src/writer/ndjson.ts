import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { BaseRecord } from "../common/types.js";
import { debug, info } from "../common/logger.js";
import { recordsForDebugLog } from "../common/record-log.js";

export type WriteOptions = {
    outputDir: string;
    name: string;
    service: string;
    dryRun?: boolean;
};

export type RecordKeyGetter = (record: BaseRecord) => string | undefined;

const getYearMonth = (unixTimeMs: number): { year: string; month: string } => {
    const date = new Date(unixTimeMs);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return { year, month };
};

type ReplaceFilter = {
    type: string;
    sinceUnixTimeMs: number;
};

const getYearMonthRange = (startMs: number, endMs: number): { year: string; month: string }[] => {
    const result: { year: string; month: string }[] = [];
    const start = new Date(startMs);
    const end = new Date(endMs);
    let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (current <= last) {
        result.push({
            year: String(current.getUTCFullYear()),
            month: String(current.getUTCMonth() + 1).padStart(2, "0"),
        });
        current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
    }
    return result;
};

const getNdjsonFiles = async (dir: string): Promise<string[]> => {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(entries.map(async (entry) => {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                return getNdjsonFiles(entryPath);
            }
            if (entry.isFile() && entry.name.endsWith(".ndjson")) {
                return [entryPath];
            }
            return [];
        }));
        return files.flat();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw new Error(`Failed to list NDJSON files in ${dir}: ${(error as Error).message}`);
    }
};

export const readNdjsonFile = async (filePath: string): Promise<BaseRecord[]> => {
    let content: string;
    try {
        content = await fs.readFile(filePath, "utf-8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw new Error(`Failed to read NDJSON file ${filePath}: ${(error as Error).message}`);
    }

    const records: BaseRecord[] = [];
    for (const [index, line] of content.trimEnd().split("\n").entries()) {
        if (line.length === 0) continue;
        try {
            records.push(JSON.parse(line) as BaseRecord);
        } catch (error) {
            throw new Error(`Invalid NDJSON in ${filePath} at line ${index + 1}: ${(error as Error).message}`);
        }
    }
    return records;
};

const writeNdjsonFileAtomically = async (filePath: string, records: BaseRecord[]): Promise<void> => {
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true });
    let mode = 0o600;
    try {
        mode = (await fs.stat(filePath)).mode & 0o777;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    let fileHandle: fs.FileHandle | undefined;
    try {
        fileHandle = await fs.open(temporaryPath, "wx", mode);
        const lines = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
        await fileHandle.writeFile(lines, "utf-8");
        await fileHandle.sync();
        await fileHandle.close();
        fileHandle = undefined;
        await fs.rename(temporaryPath, filePath);

        const directoryHandle = await fs.open(directory, "r");
        try {
            await directoryHandle.sync();
        } finally {
            await directoryHandle.close();
        }
    } catch (error) {
        await fileHandle?.close().catch(() => undefined);
        await fs.rm(temporaryPath, { force: true });
        throw error;
    }
};

export const replaceRecords = async (
    options: WriteOptions,
    records: BaseRecord[],
    filter: ReplaceFilter
): Promise<void> => {
    const isDryRun = options.dryRun ?? Boolean(process.env.CHRONIXD_DRY_RUN);
    const FETCH_DAYS = 28;
    const maxRecordTime = records.length > 0
        ? Math.max(...records.map((r) => r.unixTimeMs))
        : filter.sinceUnixTimeMs + FETCH_DAYS * 24 * 60 * 60 * 1000;
    const yearMonths = getYearMonthRange(filter.sinceUnixTimeMs, maxRecordTime);
    const newRecordsByKey = new Map<string, BaseRecord[]>();
    for (const record of records) {
        const effectiveTime = Math.max(record.unixTimeMs, filter.sinceUnixTimeMs);
        const { year, month } = getYearMonth(effectiveTime);
        const key = `${year}/${month}`;
        const group = newRecordsByKey.get(key);
        if (group) {
            group.push(record);
        } else {
            newRecordsByKey.set(key, [record]);
        }
    }
    for (const { year, month } of yearMonths) {
        const key = `${year}/${month}`;
        const dir = path.join(options.outputDir, options.service, options.name, year);
        const filePath = path.join(dir, `${month}.ndjson`);
        const existing = await readNdjsonFile(filePath);
        const newRecords = newRecordsByKey.get(key) ?? [];
        const newRecordTimes = new Set(newRecords.map((r) => r.unixTimeMs));
        const kept = existing.filter((r) => {
            if (r.type === filter.type && r.unixTimeMs >= filter.sinceUnixTimeMs) return false;
            if (r.type === filter.type && newRecordTimes.has(r.unixTimeMs)) return false;
            return true;
        });
        const merged = [...kept, ...newRecords].toSorted((a, b) => a.unixTimeMs - b.unixTimeMs);
        if (isDryRun) {
            const dryMergedLength = kept.length + newRecords.length;
            const dryNetNew = dryMergedLength - existing.length;
            if (dryNetNew === 0) {
                info(`[DRY_RUN] no changes (${dryMergedLength} records) in ${filePath}`);
            } else if (dryNetNew > 0) {
                info(`[DRY_RUN] would add ${dryNetNew} new records (${existing.length} → ${dryMergedLength} total) in ${filePath}`);
            } else {
                info(`[DRY_RUN] would remove ${-dryNetNew} records (${existing.length} → ${dryMergedLength} total) in ${filePath}`);
            }
            debug("[DRY_RUN] records", recordsForDebugLog(newRecords));
            continue;
        }
        if (merged.length === 0) {
            if (existing.length > 0) {
                await fs.rm(filePath, { force: true });
                info(`removed ${existing.length} records (${existing.length} → 0 total) in ${filePath}`);
            }
            continue;
        }
        await writeNdjsonFileAtomically(filePath, merged);
        const netNew = merged.length - existing.length;
        if (netNew === 0) {
            info(`no changes (${merged.length} records) in ${filePath}`);
        } else if (netNew > 0) {
            info(`added ${netNew} new records (${existing.length} → ${merged.length} total) in ${filePath}`);
        } else {
            info(`removed ${-netNew} records (${existing.length} → ${merged.length} total) in ${filePath}`);
        }
    }
};

export const appendRecords = async (options: WriteOptions, records: BaseRecord[]): Promise<void> => {
    const isDryRun = options.dryRun ?? Boolean(process.env.CHRONIXD_DRY_RUN);
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
            debug("[DRY_RUN] records", recordsForDebugLog(groupRecords));
            continue;
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.appendFile(filePath, lines, "utf-8");
        info(`appended ${groupRecords.length} records to ${filePath}`);
    }
};

export const upsertRecords = async (
    options: WriteOptions,
    records: BaseRecord[],
    getRecordKey: RecordKeyGetter
): Promise<void> => {
    const isDryRun = options.dryRun ?? Boolean(process.env.CHRONIXD_DRY_RUN);
    if (records.length === 0) {
        return;
    }

    const latestByKey = new Map<string, BaseRecord>();
    for (const record of records.toSorted((a, b) => a.unixTimeMs - b.unixTimeMs)) {
        const key = getRecordKey(record);
        if (key) {
            latestByKey.set(key, record);
        }
    }
    const newRecords = [...latestByKey.values()].toSorted((a, b) => a.unixTimeMs - b.unixTimeMs);
    const newKeys = new Set(latestByKey.keys());
    if (newRecords.length === 0) {
        return;
    }

    const baseDir = path.join(options.outputDir, options.service, options.name);
    const existingFiles = await getNdjsonFiles(baseDir);
    const newRecordsByPath = new Map<string, BaseRecord[]>();
    for (const record of newRecords) {
        const { year, month } = getYearMonth(record.unixTimeMs);
        const filePath = path.join(baseDir, year, `${month}.ndjson`);
        const group = newRecordsByPath.get(filePath);
        if (group) {
            group.push(record);
        } else {
            newRecordsByPath.set(filePath, [record]);
        }
    }

    const targetFiles = new Set([...existingFiles, ...newRecordsByPath.keys()]);
    for (const filePath of [...targetFiles].sort()) {
        const existing = await readNdjsonFile(filePath);
        const newRecordsForFile = newRecordsByPath.get(filePath) ?? [];
        const kept = existing.filter((record) => {
            const key = getRecordKey(record);
            return !key || !newKeys.has(key);
        });
        const merged = [...kept, ...newRecordsForFile].toSorted((a, b) => a.unixTimeMs - b.unixTimeMs);
        if (isDryRun) {
            const dryNetNew = merged.length - existing.length;
            if (dryNetNew === 0) {
                info(`[DRY_RUN] no changes (${merged.length} records) in ${filePath}`);
            } else if (dryNetNew > 0) {
                info(`[DRY_RUN] would add ${dryNetNew} records (${existing.length} → ${merged.length} total) in ${filePath}`);
            } else {
                info(`[DRY_RUN] would remove ${-dryNetNew} records (${existing.length} → ${merged.length} total) in ${filePath}`);
            }
            debug("[DRY_RUN] records", recordsForDebugLog(newRecordsForFile));
            continue;
        }
        if (merged.length === 0) {
            await fs.rm(filePath, { force: true });
            info(`removed ${existing.length} records (${existing.length} → 0 total) in ${filePath}`);
            continue;
        }
        await writeNdjsonFileAtomically(filePath, merged);
        const netNew = merged.length - existing.length;
        if (netNew === 0) {
            info(`no changes (${merged.length} records) in ${filePath}`);
        } else if (netNew > 0) {
            info(`added ${netNew} records (${existing.length} → ${merged.length} total) in ${filePath}`);
        } else {
            info(`removed ${-netNew} records (${existing.length} → ${merged.length} total) in ${filePath}`);
        }
    }
};
