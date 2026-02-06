import * as fs from "fs/promises";
import * as path from "path";
import { SCHEMA_DEFINITIONS, type ColumnSchema } from "../schema/definitions.js";
import { info } from "../common/logger.js";

type ExtraColumns = {
    serviceDir: string;
    columns: Record<string, ColumnSchema>;
};

export const writeServiceSchemas = async (outputDir: string, extraColumns?: ExtraColumns[]): Promise<void> => {
    const schema: Record<string, { description: string; path: string; columns: Record<string, unknown> }> = {};
    for (const def of SCHEMA_DEFINITIONS) {
        const extra = extraColumns?.filter((e) => e.serviceDir === def.serviceDir) ?? [];
        const mergedColumns = extra.reduce(
            (acc, e) => ({ ...acc, ...e.columns }),
            { ...def.columns }
        );
        schema[def.serviceDir] = {
            description: def.description,
            path: `${def.serviceDir}/**/*.ndjson`,
            columns: mergedColumns,
        };
    }
    await fs.mkdir(outputDir, { recursive: true });
    const schemaPath = path.join(outputDir, "schema.json");
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2) + "\n", "utf-8");
    info("wrote schema to %s", schemaPath);

    await writeAgentsMd(outputDir);
    await writeClaudeMd(outputDir);
};

const generateAgentsMd = (): string => {
    const serviceList = SCHEMA_DEFINITIONS.map(
        (def) => `- \`${def.serviceDir}\`: ${def.description}`
    ).join("\n");

    const exampleService = SCHEMA_DEFINITIONS[0];
    const examplePath = `${exampleService.serviceDir}/**/*.ndjson`;

    return `# Data Directory

NDJSON data collected by chronixd from various services.
Queryable directly with DuckDB \`read_ndjson\`.

## Directory Structure

\`\`\`
{service}/{name}/{year}/{month}.ndjson
\`\`\`

## Schema

See [schema.json](./schema.json) for column definitions.
Each service's \`path\` is relative to this directory and can be passed directly to \`read_ndjson(path)\`.

## Services

${serviceList}

## Query Examples

\`\`\`sql
-- All records from a specific service
SELECT * FROM read_ndjson('${examplePath}');

-- Latest 100 records across all services
SELECT type, unixTimeMs, url
FROM read_ndjson('**/*.ndjson')
ORDER BY unixTimeMs DESC
LIMIT 100;

-- Convert timestamp to datetime
SELECT *, epoch_ms(unixTimeMs) AS timestamp
FROM read_ndjson('${examplePath}')
ORDER BY unixTimeMs DESC;
\`\`\`
`;
};

const writeAgentsMd = async (outputDir: string): Promise<void> => {
    const filePath = path.join(outputDir, "AGENTS.md");
    await fs.writeFile(filePath, generateAgentsMd(), "utf-8");
    info("wrote %s", filePath);
};

const writeClaudeMd = async (outputDir: string): Promise<void> => {
    const filePath = path.join(outputDir, "CLAUDE.md");
    await fs.writeFile(filePath, "See @AGENTS.md\n", "utf-8");
    info("wrote %s", filePath);
};
