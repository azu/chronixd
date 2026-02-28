import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parseCli } from "./cli.js";

describe("parseCli", () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = process.argv;
    });

    afterEach(() => {
        process.argv = originalArgv;
    });

    test("no subcommand defaults to pull", () => {
        process.argv = ["bun", "src/index.ts", "--output", "./mydb"];
        const result = parseCli();
        expect(result.command).toBe("pull");
        expect(result).toEqual({ command: "pull", output: "./mydb", limit: 1000 });
    });

    test("pull subcommand", () => {
        process.argv = ["bun", "src/index.ts", "pull", "--output", "./db", "--limit", "500"];
        const result = parseCli();
        expect(result.command).toBe("pull");
        expect(result).toEqual({ command: "pull", output: "./db", limit: 500 });
    });

    test("pull defaults", () => {
        process.argv = ["bun", "src/index.ts", "pull"];
        const result = parseCli();
        expect(result).toEqual({ command: "pull", output: "./db", limit: 1000 });
    });

    test("generate subcommand", () => {
        process.argv = ["bun", "src/index.ts", "generate", "--input", "./mydb", "--output", "./dist"];
        const result = parseCli();
        expect(result.command).toBe("generate");
        expect(result).toEqual({ command: "generate", input: "./mydb", output: "./dist", language: "ja", since: null });
    });

    test("generate with language option", () => {
        process.argv = ["bun", "src/index.ts", "generate", "-L", "en"];
        const result = parseCli();
        expect(result.command).toBe("generate");
        expect(result).toEqual({ command: "generate", input: "./db", output: "./dist", language: "en", since: null });
    });

    test("generate with since option", () => {
        process.argv = ["bun", "src/index.ts", "generate", "--since", "2026-02"];
        const result = parseCli();
        expect(result.command).toBe("generate");
        expect(result).toEqual({ command: "generate", input: "./db", output: "./dist", language: "ja", since: "2026-02" });
    });

    test("backward compat: no args at all", () => {
        process.argv = ["bun", "src/index.ts"];
        const result = parseCli();
        expect(result.command).toBe("pull");
        expect(result).toEqual({ command: "pull", output: "./db", limit: 1000 });
    });

    test("backward compat: -- --output ./db (existing scripts)", () => {
        process.argv = ["bun", "src/index.ts", "--", "--output", "./db"];
        const result = parseCli();
        expect(result.command).toBe("pull");
        expect(result.output).toBe("./db");
    });
});
