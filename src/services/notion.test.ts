import { describe, test, expect } from "bun:test";
import { isNotionEnv, extractPropertyValue, NotionType } from "./notion.js";

describe("isNotionEnv", () => {
    test("returns true for valid NotionEnv", () => {
        const env = {
            notion_token: "secret_xxx",
            notion_data_source_id: "abc-123",
        };
        expect(isNotionEnv(env)).toBe(true);
    });

    test("returns false when notion_token is missing", () => {
        const env = {
            notion_data_source_id: "abc-123",
        };
        expect(isNotionEnv(env)).toBe(false);
    });

    test("returns false when notion_data_source_id is missing", () => {
        const env = {
            notion_token: "secret_xxx",
        };
        expect(isNotionEnv(env)).toBe(false);
    });

    test("returns false for null", () => {
        expect(isNotionEnv(null)).toBe(false);
    });

    test("returns false for non-object", () => {
        expect(isNotionEnv("string")).toBe(false);
    });
});

describe("extractPropertyValue", () => {
    test("extracts title", () => {
        const prop = {
            id: "title",
            type: "title" as const,
            title: [{ type: "text" as const, text: { content: "Hello", link: null }, plain_text: "Hello", href: null, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" as const } }],
        };
        expect(extractPropertyValue(prop)).toBe("Hello");
    });

    test("extracts rich_text", () => {
        const prop = {
            id: "abc",
            type: "rich_text" as const,
            rich_text: [{ type: "text" as const, text: { content: "World", link: null }, plain_text: "World", href: null, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" as const } }],
        };
        expect(extractPropertyValue(prop)).toBe("World");
    });

    test("extracts number", () => {
        const prop = { id: "abc", type: "number" as const, number: 42 };
        expect(extractPropertyValue(prop)).toBe(42);
    });

    test("returns undefined for null number", () => {
        const prop = { id: "abc", type: "number" as const, number: null };
        expect(extractPropertyValue(prop)).toBeUndefined();
    });

    test("extracts select", () => {
        const prop = {
            id: "abc",
            type: "select" as const,
            select: { id: "1", name: "Option A", color: "blue" as const },
        };
        expect(extractPropertyValue(prop)).toBe("Option A");
    });

    test("returns undefined for null select", () => {
        const prop = { id: "abc", type: "select" as const, select: null };
        expect(extractPropertyValue(prop)).toBeUndefined();
    });

    test("extracts multi_select as name array", () => {
        const prop = {
            id: "abc",
            type: "multi_select" as const,
            multi_select: [
                { id: "1", name: "Tag1", color: "blue" as const },
                { id: "2", name: "Tag2", color: "red" as const },
            ],
        };
        expect(extractPropertyValue(prop)).toEqual(["Tag1", "Tag2"]);
    });

    test("extracts status", () => {
        const prop = {
            id: "abc",
            type: "status" as const,
            status: { id: "1", name: "Done", color: "green" as const },
        };
        expect(extractPropertyValue(prop)).toBe("Done");
    });

    test("extracts date with start only", () => {
        const prop = {
            id: "abc",
            type: "date" as const,
            date: { start: "2025-01-01", end: null, time_zone: null },
        };
        expect(extractPropertyValue(prop)).toEqual({ start: "2025-01-01" });
    });

    test("extracts date with start and end", () => {
        const prop = {
            id: "abc",
            type: "date" as const,
            date: { start: "2025-01-01", end: "2025-01-05", time_zone: null },
        };
        expect(extractPropertyValue(prop)).toEqual({ start: "2025-01-01", end: "2025-01-05" });
    });

    test("returns undefined for null date", () => {
        const prop = { id: "abc", type: "date" as const, date: null };
        expect(extractPropertyValue(prop)).toBeUndefined();
    });

    test("extracts checkbox", () => {
        const prop = { id: "abc", type: "checkbox" as const, checkbox: true };
        expect(extractPropertyValue(prop)).toBe(true);
    });

    test("extracts url", () => {
        const prop = { id: "abc", type: "url" as const, url: "https://example.com" };
        expect(extractPropertyValue(prop)).toBe("https://example.com");
    });

    test("extracts email", () => {
        const prop = { id: "abc", type: "email" as const, email: "test@example.com" };
        expect(extractPropertyValue(prop)).toBe("test@example.com");
    });

    test("extracts phone_number", () => {
        const prop = { id: "abc", type: "phone_number" as const, phone_number: "+81-90-1234-5678" };
        expect(extractPropertyValue(prop)).toBe("+81-90-1234-5678");
    });

    test("extracts formula string", () => {
        const prop = {
            id: "abc",
            type: "formula" as const,
            formula: { type: "string" as const, string: "computed" },
        };
        expect(extractPropertyValue(prop)).toBe("computed");
    });

    test("extracts formula number", () => {
        const prop = {
            id: "abc",
            type: "formula" as const,
            formula: { type: "number" as const, number: 100 },
        };
        expect(extractPropertyValue(prop)).toBe(100);
    });

    test("extracts formula boolean", () => {
        const prop = {
            id: "abc",
            type: "formula" as const,
            formula: { type: "boolean" as const, boolean: false },
        };
        expect(extractPropertyValue(prop)).toBe(false);
    });

    test("extracts formula date", () => {
        const prop = {
            id: "abc",
            type: "formula" as const,
            formula: { type: "date" as const, date: { start: "2025-01-01", end: null, time_zone: null } },
        };
        expect(extractPropertyValue(prop)).toEqual({ start: "2025-01-01" });
    });

    test("extracts relation as id array", () => {
        const prop = {
            id: "abc",
            type: "relation" as const,
            relation: [{ id: "page-1" }, { id: "page-2" }],
        };
        expect(extractPropertyValue(prop)).toEqual(["page-1", "page-2"]);
    });

    test("extracts created_time", () => {
        const prop = { id: "abc", type: "created_time" as const, created_time: "2025-01-01T00:00:00.000Z" };
        expect(extractPropertyValue(prop)).toBe("2025-01-01T00:00:00.000Z");
    });

    test("extracts last_edited_time", () => {
        const prop = { id: "abc", type: "last_edited_time" as const, last_edited_time: "2025-01-01T12:00:00.000Z" };
        expect(extractPropertyValue(prop)).toBe("2025-01-01T12:00:00.000Z");
    });

    test("extracts files as url array", () => {
        const prop = {
            id: "abc",
            type: "files" as const,
            files: [
                { type: "external" as const, name: "file1", external: { url: "https://example.com/a.png" } },
                { type: "file" as const, name: "file2", file: { url: "https://s3.example.com/b.png", expiry_time: "2025-01-01T00:00:00.000Z" } },
            ],
        };
        expect(extractPropertyValue(prop)).toEqual(["https://example.com/a.png", "https://s3.example.com/b.png"]);
    });

    test("returns undefined for unsupported types", () => {
        const prop = {
            id: "abc",
            type: "people" as const,
            people: [],
        };
        expect(extractPropertyValue(prop as never)).toBeUndefined();
    });
});

describe("NotionType", () => {
    test("is 'Notion'", () => {
        expect(NotionType).toBe("Notion");
    });
});
