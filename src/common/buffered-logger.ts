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

let originalConsole = {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
};

const intercept = (level: LogLevel) => {
    return (...args: unknown[]) => {
        const context = asyncLocalStorage.getStore();
        if (context) {
            context.buffer.push({ level, args });
        } else {
            originalConsole[level](...args);
        }
    };
};

export const installLogInterceptor = () => {
    originalConsole = {
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
    };
    console.info = intercept("info");
    console.warn = intercept("warn");
    console.error = intercept("error");
    console.debug = intercept("debug");
};

export const uninstallLogInterceptor = () => {
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
};

export const isInsideLogBuffer = (): boolean => {
    return asyncLocalStorage.getStore() !== undefined;
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
        originalConsole.info(`::group::${context.label}`);
    } else {
        originalConsole.info(`--- ${context.label} ---`);
    }
    for (const entry of context.buffer) {
        originalConsole[entry.level](...addPrefix(context.label, entry.args));
    }
    if (isGitHubActions) {
        originalConsole.info("::endgroup::");
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
