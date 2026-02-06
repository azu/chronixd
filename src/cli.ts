import { parseArgs } from "util";

export type CliOptions = {
    output: string;
    limit: number;
};

export const parseCli = (): CliOptions => {
    const { values } = parseArgs({
        args: process.argv.slice(2),
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
        output: values.output ?? "./db",
        limit: Number(values.limit ?? "1000"),
    };
};
