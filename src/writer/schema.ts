import * as fs from "fs/promises";
import * as path from "path";
import { SCHEMA_DEFINITIONS } from "../schema/definitions.js";
import { info } from "../common/logger.js";

export const writeServiceSchemas = async (outputDir: string): Promise<void> => {
    const schema: Record<string, { description: string; path: string; columns: Record<string, unknown> }> = {};
    for (const def of SCHEMA_DEFINITIONS) {
        schema[def.serviceDir] = {
            description: def.description,
            path: `${def.serviceDir}/**/*.ndjson`,
            columns: def.columns,
        };
    }
    const filePath = path.join(outputDir, "schema.json");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2) + "\n", "utf-8");
    info("wrote schema to %s", filePath);
};
