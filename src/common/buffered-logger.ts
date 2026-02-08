/* eslint-disable no-console */
import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "info" | "warn" | "error" | "debug";

type LogEntry = {
    level: LogLevel;
    args: unknown[];
};

type LogContext = {
    buffer: LogEntry[];
    label: string;
};

const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export const isInsideLogBuffer = (): boolean => {
    return asyncLocalStorage.getStore() !== undefined;
};

export const pushToLogBuffer = (level: LogLevel, args: unknown[]): boolean => {
    const context = asyncLocalStorage.getStore();
    if (context) {
        context.buffer.push({ level, args });
        return true;
    }
    return false;
};

const addPrefix = (label: string, args: unknown[]): unknown[] => {
    const prefix = `[${label}]`;
    if (args.length > 0 && typeof args[0] === "string") {
        return [`${prefix} ${args[0]}`, ...args.slice(1)];
    }
    return [prefix, ...args];
};

const flushBuffer = (context: LogContext) => {
    if (context.buffer.length === 0) return;
    const isGitHubActions = Boolean(process.env.GITHUB_ACTIONS);
    if (isGitHubActions) {
        console.info(`::group::${context.label}`);
    } else {
        console.info(`--- ${context.label} ---`);
    }
    for (const entry of context.buffer) {
        console[entry.level](...addPrefix(context.label, entry.args));
    }
    if (isGitHubActions) {
        console.info("::endgroup::");
    }
};

export const runWithLogBuffer = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const context: LogContext = { buffer: [], label };
    return asyncLocalStorage.run(context, async () => {
        try {
            const result = await fn();
            flushBuffer(context);
            return result;
        } catch (error) {
            flushBuffer(context);
            throw error;
        }
    });
};
