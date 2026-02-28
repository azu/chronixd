import { parseArgs } from "util";

export type PullCliOptions = {
    command: "pull";
    output: string;
    limit: number;
};

export type GenerateCliOptions = {
    command: "generate";
    input: string;
    output: string;
    language: string;
    since: string | null;
};

export type CliOptions = PullCliOptions | GenerateCliOptions;

const parsePullArgs = (args: string[]): PullCliOptions => {
    const { values } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            output: {
                type: "string",
                short: "o",
                default: "./db",
            },
            limit: {
                type: "string",
                short: "l",
                default: "1000",
            },
        },
    });
    return {
        command: "pull",
        output: values.output ?? "./db",
        limit: Number(values.limit ?? "1000"),
    };
};

const parseGenerateArgs = (args: string[]): GenerateCliOptions => {
    const { values } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            input: {
                type: "string",
                short: "i",
                default: "./db",
            },
            output: {
                type: "string",
                short: "o",
                default: "./dist",
            },
            language: {
                type: "string",
                short: "L",
                default: "ja",
            },
            since: {
                type: "string",
                short: "s",
            },
        },
    });
    return {
        command: "generate",
        input: values.input ?? "./db",
        output: values.output ?? "./dist",
        language: values.language ?? "ja",
        since: values.since ?? null,
    };
};

export const parseCli = (): CliOptions => {
    const args = process.argv.slice(2);
    const subcommand = args[0];

    if (subcommand === "generate") {
        return parseGenerateArgs(args.slice(1));
    }

    // "pull" or no subcommand (backward compat)
    if (subcommand === "pull") {
        return parsePullArgs(args.slice(1));
    }

    // No subcommand: treat as pull with all args
    return parsePullArgs(args);
};
