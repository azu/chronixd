/* eslint-disable no-console */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installLogInterceptor, runWithLogBuffer, uninstallLogInterceptor } from "./buffered-logger.js";

let infoOutput: unknown[][] = [];
let warnOutput: unknown[][] = [];
let errorOutput: unknown[][] = [];
let savedConsole: { info: typeof console.info; warn: typeof console.warn; error: typeof console.error };

beforeEach(() => {
    infoOutput = [];
    warnOutput = [];
    errorOutput = [];
    // Save real console before any modification
    savedConsole = {
        info: console.info,
        warn: console.warn,
        error: console.error,
    };
    // Replace console with spies first
    console.info = (...args: unknown[]) => { infoOutput.push(args); };
    console.warn = (...args: unknown[]) => { warnOutput.push(args); };
    console.error = (...args: unknown[]) => { errorOutput.push(args); };
    // Install interceptor on top of spies — originalConsole will capture our spies
    installLogInterceptor();
});

afterEach(() => {
    uninstallLogInterceptor();
    // Restore real console
    console.info = savedConsole.info;
    console.warn = savedConsole.warn;
    console.error = savedConsole.error;
});

describe("buffered-logger", () => {
    test("logs outside runWithLogBuffer are output immediately", () => {
        console.info("immediate log");
        expect(infoOutput).toEqual([["immediate log"]]);
    });

    test("logs inside runWithLogBuffer are buffered and flushed with prefix", async () => {
        await runWithLogBuffer("TestService", async () => {
            console.info("buffered log 1");
            console.warn("buffered warn");
            console.info("buffered log 2");
        });
        expect(infoOutput.length).toBe(3); // header + log1 + log2
        expect(infoOutput[0][0]).toBe("--- TestService ---");
        expect(infoOutput[1]).toEqual(["[TestService] buffered log 1"]);
        expect(infoOutput[2]).toEqual(["[TestService] buffered log 2"]);
        expect(warnOutput).toEqual([["[TestService] buffered warn"]]);
    });

    test("logs are flushed even when an error is thrown", async () => {
        const err = new Error("test error");
        await expect(
            runWithLogBuffer("ErrorService", async () => {
                console.info("before error");
                throw err;
            })
        ).rejects.toThrow("test error");
        expect(infoOutput[0][0]).toBe("--- ErrorService ---");
        expect(infoOutput[1]).toEqual(["[ErrorService] before error"]);
    });

    test("parallel runWithLogBuffer calls do not interleave logs", async () => {
        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        await Promise.all([
            runWithLogBuffer("ServiceA", async () => {
                console.info("A-1");
                await delay(10);
                console.info("A-2");
            }),
            runWithLogBuffer("ServiceB", async () => {
                console.info("B-1");
                await delay(5);
                console.info("B-2");
            }),
        ]);

        const allInfoArgs = infoOutput.map((args) => args[0]);
        expect(allInfoArgs).toContain("--- ServiceA ---");
        expect(allInfoArgs).toContain("--- ServiceB ---");
        const aHeaderIdx = allInfoArgs.indexOf("--- ServiceA ---");
        const bHeaderIdx = allInfoArgs.indexOf("--- ServiceB ---");

        // A's logs are consecutive with prefix
        expect(allInfoArgs[aHeaderIdx + 1]).toBe("[ServiceA] A-1");
        expect(allInfoArgs[aHeaderIdx + 2]).toBe("[ServiceA] A-2");

        // B's logs are consecutive with prefix
        expect(allInfoArgs[bHeaderIdx + 1]).toBe("[ServiceB] B-1");
        expect(allInfoArgs[bHeaderIdx + 2]).toBe("[ServiceB] B-2");
    });

    test("empty buffer does not produce output", async () => {
        await runWithLogBuffer("EmptyService", async () => {
            // no logs
        });
        expect(infoOutput).toEqual([]);
    });

    test("uses ::group:: format when GITHUB_ACTIONS is set", async () => {
        const original = process.env.GITHUB_ACTIONS;
        process.env.GITHUB_ACTIONS = "true";
        try {
            await runWithLogBuffer("CIService", async () => {
                console.info("ci log");
            });
            expect(infoOutput[0][0]).toBe("::group::CIService");
            expect(infoOutput[1]).toEqual(["[CIService] ci log"]);
            expect(infoOutput[2][0]).toBe("::endgroup::");
        } finally {
            if (original === undefined) {
                delete process.env.GITHUB_ACTIONS;
            } else {
                process.env.GITHUB_ACTIONS = original;
            }
        }
    });
});
