import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { RateLimitError } from "../common/RateLimitError.js";
import { fetchGitHubEvents } from "./github.js";

const env = { github_username: "test-user", github_token: "test-token" };
const policyMessage = "`blocked-org` forbids access via a personal access token (classic). Please use a GitHub App, OAuth App, or a personal access token with fine-grained permissions.";
const event = (type: string, repo: string, payload: object) => ({
    id: "1",
    type,
    repo: { name: repo },
    actor: { login: "test-user" },
    created_at: "2026-09-14T08:27:09.000Z",
    payload: type === "PushEvent" ? { ref: "refs/heads/main", ...payload } : payload,
});
const response = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
});

describe("GitHub event detail access restrictions", () => {
    const spies: Array<{ mockRestore(): void }> = [];
    afterEach(() => {
        for (const spy of spies.splice(0)) spy.mockRestore();
    });

    const mockRequests = (events: object[], detailResponse: (url: string) => Response) => {
        const requests: string[] = [];
        spies.push(spyOn(globalThis, "fetch").mockImplementation((async (input) => {
            const url = String(input);
            if (url.endsWith("/users/test-user/events")) return response(events);
            requests.push(url);
            return detailResponse(url);
        }) as typeof fetch));
        const warn = spyOn(console, "warn").mockImplementation(() => {});
        const error = spyOn(console, "error").mockImplementation(() => {});
        spies.push(warn, error, spyOn(console, "info").mockImplementation(() => {}));
        return { requests, warn, error };
    };

    test("skips subsequent details for a forbidden repository while preserving events and other owners", async () => {
        const events = [
            event("PushEvent", "blocked-org/one", { head: "sha-1" }),
            event("PushEvent", "blocked-org/one", { head: "sha-2" }),
            event("PullRequestEvent", "BLOCKED-ORG/one", { pull_request: { number: 61 } }),
            event("IssuesEvent", "blocked-org/one", { issue: { number: 7 } }),
            event("PushEvent", "blocked-org/allowed", { head: "sha-3" }),
            event("PullRequestEvent", "blocked-org/one", {
                pull_request: { number: 62, title: "Existing title", body: "Existing body" },
            }),
        ];
        const mocks = mockRequests(events, (url) => url.toLowerCase().includes("/blocked-org/one/")
            ? response({ message: policyMessage }, 403)
            : response({ commit: { message: "Allowed commit" } }));

        const records = await fetchGitHubEvents(env, null);

        expect(records).toHaveLength(events.length);
        expect(mocks.requests).toEqual([
            "https://api.github.com/repos/blocked-org/one/commits/sha-1",
            "https://api.github.com/repos/blocked-org/allowed/commits/sha-3",
        ]);
        expect(records[2]).toMatchObject({
            title: "Pull request #61 on BLOCKED-ORG/one",
            number: 61,
            url: "https://github.com/BLOCKED-ORG/one/pull/61",
        });
        expect(records[3].title).toBe("Issue #7 on blocked-org/one");
        expect(records[4].body).toBe("- Allowed commit");
        expect(records[5]).toMatchObject({ title: "Existing title", body: "Existing body" });
        expect(mocks.warn).toHaveBeenCalledTimes(1);
        expect(mocks.error).not.toHaveBeenCalled();
    });

    for (const type of ["PullRequestEvent", "IssuesEvent"]) {
        test(`handles a policy rejection first encountered while fetching ${type}`, async () => {
            const payload = type === "PullRequestEvent" ? { pull_request: { number: 1 } } : { issue: { number: 1 } };
            const mocks = mockRequests([
                event(type, "blocked-org/repo", payload),
                event("PushEvent", "blocked-org/repo", { head: "sha" }),
            ], () => response({ message: policyMessage }, 403));

            expect(await fetchGitHubEvents(env, null)).toHaveLength(2);
            expect(mocks.requests).toHaveLength(1);
            expect(mocks.warn).toHaveBeenCalledTimes(1);
            expect(mocks.error).not.toHaveBeenCalled();
        });
    }

    test("rechecks access on the next pull, including with a different token", async () => {
        let blocked = true;
        const mocks = mockRequests([event("PushEvent", "blocked-org/repo", { head: "sha" })],
            () => blocked ? response({ message: policyMessage }, 403) : response({ commit: { message: "Restored" } }));

        await fetchGitHubEvents(env, null);
        await fetchGitHubEvents(env, null);
        blocked = false;
        const records = await fetchGitHubEvents({ ...env, github_token: "other-token" }, null);

        expect(mocks.requests).toHaveLength(3);
        expect(records[0].body).toBe("- Restored");
    });

    test("handles an arbitrary forbidden message without matching its text", async () => {
        const mocks = mockRequests([
            event("PushEvent", "owner/repo", { head: "sha-1" }),
            event("PushEvent", "owner/repo", { head: "sha-2" }),
        ], () => response({ message: "Different wording" }, 403));
        expect(await fetchGitHubEvents(env, null)).toHaveLength(2);
        expect(mocks.requests).toHaveLength(1);
        expect(mocks.warn).toHaveBeenCalledTimes(1);
        expect(mocks.error).not.toHaveBeenCalled();
    });

    for (const [status, headers] of [
        [403, { "x-ratelimit-remaining": "0" }],
        [403, { "retry-after": "60" }],
        [429, {}],
    ] as Array<[number, Record<string, string>]>) {
        test(`stops requests on rate limiting: ${status} ${JSON.stringify(headers)}`, async () => {
            const mocks = mockRequests([
                event("PushEvent", "owner/repo", { head: "sha-1" }),
                event("PushEvent", "other/repo", { head: "sha-2" }),
            ], () => response({ message: "Any wording" }, status, headers));
            await expect(fetchGitHubEvents(env, null)).rejects.toBeInstanceOf(RateLimitError);
            expect(mocks.requests).toHaveLength(1);
            expect(mocks.warn).not.toHaveBeenCalled();
        });
    }

    for (const [status, message] of [
        [401, "Bad credentials"],
        [404, "Not Found"],
        [500, "Internal Server Error"],
    ] as const) {
        test(`does not suppress other errors: ${status} ${message}`, async () => {
            const mocks = mockRequests([
                event("PushEvent", "owner/repo", { head: "sha-1" }),
                event("PushEvent", "owner/repo", { head: "sha-2" }),
            ], () => response({ message }, status));

            expect(await fetchGitHubEvents(env, null)).toHaveLength(2);
            expect(mocks.requests).toHaveLength(2);
            expect(mocks.error).toHaveBeenCalledTimes(2);
            expect(mocks.warn).not.toHaveBeenCalled();
        });
    }
});
