import type { BaseRecord } from "./types.js";

export const recordForDebugLog = (record: BaseRecord | null): unknown => {
    if (!record || record.type !== "Oura") return record;
    const value = record as BaseRecord & {
        id?: string;
        dataType?: string;
        day?: string;
    };
    return {
        type: value.type,
        unixTimeMs: value.unixTimeMs,
        id: value.id,
        dataType: value.dataType,
        day: value.day,
        healthData: "[REDACTED]",
    };
};

export const recordsForDebugLog = (records: BaseRecord[]): unknown[] => {
    return records.map((record) => recordForDebugLog(record));
};
