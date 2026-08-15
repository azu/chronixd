import { describe, expect, test } from "bun:test";
import {
    markOuraOnePasswordRefreshUncertain,
    type OnePasswordCommandRunner,
    readOuraOnePasswordTokenState,
    writeOuraOnePasswordTokenState,
} from "./oura-onepassword.js";

const config = {
    vault: "chronixd",
    item: "oura-oauth",
};

const createItem = () => ({
    id: "item-id",
    title: "oura-oauth",
    category: "API_CREDENTIAL",
    fields: [
        { id: "access_token", label: "access_token", type: "CONCEALED", value: "old-access-token" },
        { id: "refresh_token", label: "refresh_token", type: "CONCEALED", value: "old-refresh-token" },
        { id: "expires_at", label: "expires_at", type: "STRING", value: "1783742400000" },
        { id: "refresh_status", label: "refresh_status", type: "STRING", value: "ready" },
    ],
});

const createFakeRunner = () => {
    let item = createItem();
    const calls: Array<{ args: string[]; standardInput?: string }> = [];
    const runner: OnePasswordCommandRunner = async (args, standardInput) => {
        calls.push({ args, standardInput });
        if (args[1] === "get") return JSON.stringify(item);
        if (args[1] === "edit") {
            if (!standardInput) throw new Error("missing stdin");
            item = JSON.parse(standardInput);
            return JSON.stringify(item);
        }
        throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    return {
        calls,
        getItem: () => item,
        runner,
    };
};

const getFieldValue = (item: ReturnType<typeof createItem>, label: string): unknown => {
    return item.fields.find((field) => field.label === label)?.value;
};

describe("Oura 1Password token store", () => {
    test("reads the complete rotating token state without the 1Password CLI cache", async () => {
        const fake = createFakeRunner();

        const state = await readOuraOnePasswordTokenState(config, fake.runner);

        expect(state).toEqual({
            accessToken: "old-access-token",
            refreshToken: "old-refresh-token",
            expiresAt: 1_783_742_400_000,
        });
        expect(fake.calls[0].args).toEqual([
            "item",
            "get",
            "oura-oauth",
            "--vault",
            "chronixd",
            "--format=json",
            "--cache=false",
        ]);
    });

    test("persists the uncertain marker before a single-use refresh", async () => {
        const fake = createFakeRunner();

        await markOuraOnePasswordRefreshUncertain(config, fake.runner);

        const status = getFieldValue(fake.getItem(), "refresh_status");
        expect(status).toStartWith("uncertain:");
        await expect(readOuraOnePasswordTokenState(config, fake.runner)).rejects.toThrow(
            "previous Oura OAuth refresh did not complete safely",
        );
    });

    test("writes the rotated pair and ready state in one item edit via stdin", async () => {
        const fake = createFakeRunner();

        await markOuraOnePasswordRefreshUncertain(config, fake.runner);
        fake.calls.length = 0;
        await writeOuraOnePasswordTokenState(config, {
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
            expiresAt: 1_783_746_000_000,
        }, fake.runner);

        const edits = fake.calls.filter((call) => call.args[1] === "edit");
        expect(edits).toHaveLength(1);
        expect(edits[0].args).toEqual([
            "item",
            "edit",
            "oura-oauth",
            "--vault",
            "chronixd",
            "--format=json",
        ]);
        expect(edits[0].args.join(" ")).not.toContain("new-access-token");
        expect(edits[0].args.join(" ")).not.toContain("new-refresh-token");
        expect(edits[0].standardInput).toContain("new-access-token");
        expect(getFieldValue(fake.getItem(), "access_token")).toBe("new-access-token");
        expect(getFieldValue(fake.getItem(), "refresh_token")).toBe("new-refresh-token");
        expect(getFieldValue(fake.getItem(), "expires_at")).toBe("1783746000000");
        expect(getFieldValue(fake.getItem(), "refresh_status")).toBe("ready");
    });

    test("accepts an uncertain marker only after an ambiguous edit is confirmed by read-back", async () => {
        let item = createItem();
        const runner: OnePasswordCommandRunner = async (args, standardInput) => {
            if (args[1] === "get") return JSON.stringify(item);
            if (args[1] === "edit" && standardInput) {
                item = JSON.parse(standardInput);
                throw new Error("connection closed after commit");
            }
            throw new Error(`unexpected command: ${args.join(" ")}`);
        };

        await expect(markOuraOnePasswordRefreshUncertain(config, runner)).resolves.toBeUndefined();
        expect(getFieldValue(item, "refresh_status")).toStartWith("uncertain:");
    });

    test("accepts a rotated state only after an ambiguous edit is confirmed by read-back", async () => {
        let item = createItem();
        item.fields.find((field) => field.label === "refresh_status")!.value = "uncertain:attempt";
        const runner: OnePasswordCommandRunner = async (args, standardInput) => {
            if (args[1] === "get") return JSON.stringify(item);
            if (args[1] === "edit" && standardInput) {
                item = JSON.parse(standardInput);
                throw new Error("connection closed after commit");
            }
            throw new Error(`unexpected command: ${args.join(" ")}`);
        };

        await expect(writeOuraOnePasswordTokenState(config, {
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
            expiresAt: 1_783_746_000_000,
        }, runner)).resolves.toBeUndefined();
        expect(getFieldValue(item, "refresh_status")).toBe("ready");
        expect(getFieldValue(item, "refresh_token")).toBe("new-refresh-token");
    });

    test("retries an uncommitted rotated state without repeating the Oura refresh", async () => {
        let item = createItem();
        item.fields.find((field) => field.label === "refresh_status")!.value = "uncertain:attempt";
        let editAttempts = 0;
        const runner: OnePasswordCommandRunner = async (args, standardInput) => {
            if (args[1] === "get") return JSON.stringify(item);
            if (args[1] === "edit" && standardInput) {
                editAttempts += 1;
                if (editAttempts < 3) throw new Error("temporary write failure");
                item = JSON.parse(standardInput);
                return JSON.stringify(item);
            }
            throw new Error(`unexpected command: ${args.join(" ")}`);
        };

        await writeOuraOnePasswordTokenState(config, {
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
        }, runner);

        expect(editAttempts).toBe(3);
        expect(getFieldValue(item, "refresh_token")).toBe("new-refresh-token");
        expect(getFieldValue(item, "refresh_status")).toBe("ready");
    });

    test("fails closed when a required item field is missing", async () => {
        let item = createItem();
        item.fields = item.fields.filter((field) => field.label !== "refresh_status");
        const runner: OnePasswordCommandRunner = async () => JSON.stringify(item);

        await expect(readOuraOnePasswordTokenState(config, runner)).rejects.toThrow(
            "exactly one 'refresh_status' field",
        );
    });

    test("fails closed when the refresh token is empty", async () => {
        const item = createItem();
        item.fields.find((field) => field.label === "refresh_token")!.value = "";
        const runner: OnePasswordCommandRunner = async () => JSON.stringify(item);

        await expect(readOuraOnePasswordTokenState(config, runner)).rejects.toThrow(
            "field 'refresh_token' is empty",
        );
    });

    test("rejects an invalid expires_at value", async () => {
        const item = createItem();
        item.fields.find((field) => field.label === "expires_at")!.value = "tomorrow";
        const runner: OnePasswordCommandRunner = async () => JSON.stringify(item);

        await expect(readOuraOnePasswordTokenState(config, runner)).rejects.toThrow(
            "field 'expires_at' is invalid",
        );
    });

    test("accepts a Secure Note when the required fields match", async () => {
        const item = { ...createItem(), category: "SECURE_NOTE" };
        const runner: OnePasswordCommandRunner = async () => JSON.stringify(item);

        await expect(readOuraOnePasswordTokenState(config, runner)).resolves.toMatchObject({
            accessToken: "old-access-token",
            refreshToken: "old-refresh-token",
        });
    });

    test("rejects a token field that is not concealed", async () => {
        const item = createItem();
        item.fields.find((field) => field.label === "access_token")!.type = "STRING";
        const runner: OnePasswordCommandRunner = async () => JSON.stringify(item);

        await expect(readOuraOnePasswordTokenState(config, runner)).rejects.toThrow(
            "'access_token' must use the CONCEALED type",
        );
    });

    test("rejects duplicate required fields", async () => {
        const item = createItem();
        item.fields.push({
            id: "duplicate-access-token",
            label: "access_token",
            type: "CONCEALED",
            value: "duplicate",
        });
        const runner: OnePasswordCommandRunner = async () => JSON.stringify(item);

        await expect(readOuraOnePasswordTokenState(config, runner)).rejects.toThrow(
            "exactly one 'access_token' field",
        );
    });
});
