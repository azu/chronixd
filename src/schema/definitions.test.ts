import { describe, test, expect } from "bun:test";
import { SCHEMA_DEFINITIONS, SERVICE_DIR_MAP } from "./definitions.js";

describe("SCHEMA_DEFINITIONS", () => {
    test("all services have common columns: type, unixTimeMs, url", () => {
        for (const def of SCHEMA_DEFINITIONS) {
            expect(def.columns).toHaveProperty("type");
            expect(def.columns).toHaveProperty("unixTimeMs");
            expect(def.columns).toHaveProperty("url");
        }
    });

    test("SERVICE_DIR_MAP has entry for all recordTypes", () => {
        for (const def of SCHEMA_DEFINITIONS) {
            expect(SERVICE_DIR_MAP[def.recordType]).toBe(def.serviceDir);
        }
    });

    test("serviceDir values form valid glob paths", () => {
        for (const def of SCHEMA_DEFINITIONS) {
            expect(def.serviceDir).toMatch(/^[a-z][a-z0-9-]*$/);
        }
    });

    test("enum values are non-empty arrays when present", () => {
        for (const def of SCHEMA_DEFINITIONS) {
            for (const [, col] of Object.entries(def.columns)) {
                if (col.enum) {
                    expect(col.enum.length).toBeGreaterThan(0);
                }
            }
        }
    });

    test("type column always has enum with recordType", () => {
        for (const def of SCHEMA_DEFINITIONS) {
            const typeCol = def.columns["type"];
            expect(typeCol.enum).toContain(def.recordType);
        }
    });
});
