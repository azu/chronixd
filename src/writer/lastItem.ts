import * as fs from "fs/promises";
import * as path from "path";
import { BaseRecord } from "../common/types.js";

export type ReadLastOptions = {
    outputDir: string;
    name: string;
    service: string;
};

export const readLastRecord = async (options: ReadLastOptions): Promise<BaseRecord | null> => {
    const serviceDir = path.join(options.outputDir, options.service, options.name);
    let years: string[];
    try {
        years = await fs.readdir(serviceDir);
    } catch {
        return null;
    }
    // Filter numeric year directories and sort descending
    const numericYears = years.filter((y) => /^\d+$/.test(y)).sort((a, b) => Number(b) - Number(a));
    for (const year of numericYears) {
        const yearDir = path.join(serviceDir, year);
        let files: string[];
        try {
            files = await fs.readdir(yearDir);
        } catch {
            continue;
        }
        // Filter .ndjson files and sort descending
        const ndjsonFiles = files
            .filter((f) => f.endsWith(".ndjson"))
            .sort((a, b) => b.localeCompare(a));
        for (const file of ndjsonFiles) {
            const filePath = path.join(yearDir, file);
            const content = await fs.readFile(filePath, "utf-8");
            const lines = content.trimEnd().split("\n").filter((line) => line.length > 0);
            if (lines.length === 0) {
                continue;
            }
            const lastLine = lines[lines.length - 1];
            try {
                return JSON.parse(lastLine) as BaseRecord;
            } catch {
                continue;
            }
        }
    }
    return null;
};
