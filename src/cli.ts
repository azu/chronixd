import { parseArgs } from "util";

export type CliOptions = {
    output: string;
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
        },
    });
    return {
        output: values.output ?? "./db",
    };
};
