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
    timezone: string | null;
};

export type AuthCliOptions = {
    command: "auth";
    service: "oura";
};

export type CliOptions = PullCliOptions | GenerateCliOptions | AuthCliOptions;

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
                default: "ja",
            },
            since: {
                type: "string",
                short: "s",
            },
            timezone: {
                type: "string",
                default: "Asia/Tokyo",
            },
        },
    });
    return {
        command: "generate",
        input: values.input ?? "./db",
        output: values.output ?? "./dist",
        language: values.language ?? "ja",
        since: values.since ?? null,
        timezone: values.timezone ?? "Asia/Tokyo",
    };
};

const parseAuthArgs = (args: string[]): AuthCliOptions => {
    const service = args[0];
    if (service !== "oura") {
        throw new Error("auth requires the supported service name 'oura'");
    }
    if (args.length > 1) {
        throw new Error("auth oura does not accept additional arguments");
    }
    return {
        command: "auth",
        service,
    };
};

export const parseCli = (): CliOptions => {
    const args = process.argv.slice(2);
    const subcommand = args[0];

    if (subcommand === "generate") {
        return parseGenerateArgs(args.slice(1));
    }

    if (subcommand === "auth") {
        return parseAuthArgs(args.slice(1));
    }

    // "pull" or no subcommand (backward compat)
    if (subcommand === "pull") {
        return parsePullArgs(args.slice(1));
    }

    // No subcommand: treat as pull with all args
    return parsePullArgs(args);
};
