import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fetchOura } from "./oura.js";
import { writeOuraOnePasswordTokenState } from "./oura-onepassword.js";

describe("Oura 1Password child process input", () => {
    let directory: string;
    let originalPath: string | undefined;
    let originalDryRun: string | undefined;
    let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
    const storedValue = async (label: string) => {
        const item = JSON.parse(await readFile(join(directory, "item.json"), "utf8"));
        return item.fields.find((field: { label: string }) => field.label === label)?.value;
    };

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "chronixd-op-test-"));
        originalPath = process.env.PATH;
        originalDryRun = process.env.CHRONIXD_DRY_RUN;
        process.env.PATH = `${directory}${delimiter}${originalPath ?? ""}`;
        delete process.env.CHRONIXD_DRY_RUN;
        // Only dummy test credentials are stored in this fixture.
        await writeFile(join(directory, "item.json"), JSON.stringify({ fields: [
            { label: "access_token", type: "CONCEALED", value: "old-access" },
            { label: "refresh_token", type: "CONCEALED", value: "old-refresh" },
            { label: "expires_at", type: "STRING", value: "" },
            { label: "refresh_status", type: "STRING", value: "ready" },
        ] }));
        await writeFile(join(directory, "op"), `#!/bin/sh
item_file="$(dirname "$0")/item.json"
if [ "$1" = item ] && [ "$2" = get ]; then
    cat "$item_file"
elif [ "$1" = item ] && [ "$2" = edit ]; then
    # Like op, accept piped JSON only when stdin is a pipe, not a socket.
    if [ ! -p /dev/stdin ]; then
        printf '%s\\n' 'stdin is not a pipe' >&2
        exit 9
    fi
    if [ "$#" -ne 6 ]; then
        printf '%s\\n' 'unexpected arguments (template or secret in argv)' >&2
        exit 9
    fi
    cat > "$item_file"
    cat "$item_file"
else
    exit 1
fi
`, { mode: 0o700 });
    });

    afterEach(async () => {
        fetchSpy?.mockRestore();
        fetchSpy = undefined;
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
        if (originalDryRun === undefined) delete process.env.CHRONIXD_DRY_RUN;
        else process.env.CHRONIXD_DRY_RUN = originalDryRun;
        await rm(directory, { recursive: true, force: true });
    });

    test("passes token JSON through a real pipe with literal item and vault arguments", async () => {
        await writeOuraOnePasswordTokenState({
            item: "item with spaces; $(exit 99)",
            vault: "vault with spaces; $(exit 99)",
        }, { accessToken: "new-access", refreshToken: "new-refresh" });
        expect(await storedValue("access_token")).toBe("new-access");
        expect(await storedValue("refresh_token")).toBe("new-refresh");
        expect(await storedValue("refresh_status")).toBe("ready");
    });

    test("completes a 401 refresh through the real runner and reuses saved tokens", async () => {
        let refreshes = 0;
        fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (input, init) => {
            if (String(input).endsWith("/oauth/token")) {
                refreshes++;
                expect(await storedValue("refresh_status")).toStartWith("uncertain:");
                return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
            }
            if (new Headers(init?.headers).get("Authorization") === "Bearer old-access") {
                return Response.json({}, { status: 401 });
            }
            expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer new-access");
            return Response.json({ data: [] });
        }) as typeof fetch);
        const env = {
            oura_1password_item: "item",
            oura_1password_vault: "vault",
            oura_client_id: "test-client",
            oura_client_secret: "test-secret",
            oura_data_types: ["daily_sleep" as const],
        };
        await fetchOura(env, null, { limit: 100 });
        await fetchOura(env, null, { limit: 100 });
        expect(refreshes).toBe(1);
        expect(await storedValue("refresh_token")).toBe("new-refresh");
        expect(await storedValue("refresh_status")).toBe("ready");
    });
});
