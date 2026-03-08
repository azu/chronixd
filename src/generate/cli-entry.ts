import { parseArgs } from "util";
import { runGenerate } from "./index.js";

const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        input: { type: "string", short: "i", default: "./db" },
        output: { type: "string", short: "o", default: "./dist" },
        language: { type: "string", default: "ja" },
        since: { type: "string", short: "s" },
        timezone: { type: "string", short: "t" },
    },
});

await runGenerate({
    command: "generate",
    input: values.input ?? "./db",
    output: values.output ?? "./dist",
    language: values.language ?? "ja",
    since: values.since ?? null,
    timezone: values.timezone ?? "Asia/Tokyo",
});
