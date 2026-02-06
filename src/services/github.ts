import { BaseRecord, GitHubEventRecord } from "../common/types.js";
import { Octokit } from "@octokit/rest";
import { createLogger } from "../common/logger.js";
import { Endpoints } from "@octokit/types";
import { compile, parse } from "parse-github-event";
import { RetryAbleError } from "../common/RetryAbleError.js";
import { RateLimitError } from "../common/RateLimitError.js";

const logger = createLogger("GitHub");
export type GitHubEnv = {
    github_token: string;
    github_username: string;
};
export const GitHubType = "GitHub" as const;
export const isGithubEnv = (env: unknown): env is GitHubEnv => {
    return typeof (env as GitHubEnv).github_token === "string" && typeof (env as GitHubEnv).github_username === "string";
}
type Events = Endpoints["GET /users/{username}/events"]["response"]["data"];
type Event = Endpoints["GET /users/{username}/events"]["response"]["data"][number];
export const fetchUserEvents = async ({
                                          github_username,
                                          GITHUB_TOKEN
                                      }: { github_username: string; GITHUB_TOKEN: string }): Promise<Events> => {
    const octokit = new Octokit({
        auth: GITHUB_TOKEN,
    });
    try {
        const rest = await octokit.request('GET /users/{username}/events', {
            username: github_username,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (rest.status >= 500 && rest.status < 600) {
            throw new RetryAbleError("Retry-able Error on GitHub: " + rest.status);
        }
        return rest.data
    } catch (error) {
        if ((error as { status: number }).status === 403) {
            throw new RateLimitError("Rate Limit Error on GitHub", {
                cause: error,
            });
        }
        throw error;
    }
};

export const collectUntil = (events: Events, lastRecord: BaseRecord): Events => {
    const filteredResults: Events = [];
    try {
        for (const event of events) {
            if (!event.created_at) continue;
            const createAtTime = new Date(event.created_at).getTime();
            if (lastRecord.unixTimeMs < createAtTime) {
                filteredResults.push(event);
            } else {
                return filteredResults;
            }
        }
    } catch (error) {
        logger.error(new Error("collect error", {
            cause: error,
        }));
        throw new Error("collect error at GitHub");
    }
    return filteredResults;
};

async function fetchCommitMessage(
    octokit: Octokit,
    owner: string,
    repo: string,
    sha: string
): Promise<string> {
    try {
        const response = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: sha,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return response.data.commit.message;
    } catch (error) {
        logger.error(new Error(`Failed to fetch commit message for ${sha}`, { cause: error }));
        return "";
    }
}

type PullRequestDetails = {
    title: string;
    body: string | null;
    state: string;
};

async function fetchPullRequestDetails(
    octokit: Octokit,
    owner: string,
    repo: string,
    pull_number: number
): Promise<PullRequestDetails | null> {
    try {
        const response = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return {
            title: response.data.title,
            body: response.data.body,
            state: response.data.merged ? "merged" : response.data.state
        };
    } catch (error) {
        logger.error(new Error(`Failed to fetch PR #${pull_number}`, { cause: error }));
        return null;
    }
}

type IssueDetails = {
    title: string;
    body: string | null;
    state: string;
};

async function fetchIssueDetails(
    octokit: Octokit,
    owner: string,
    repo: string,
    issue_number: number
): Promise<IssueDetails | null> {
    try {
        const response = await octokit.rest.issues.get({
            owner,
            repo,
            issue_number,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return {
            title: response.data.title,
            body: response.data.body ?? null,
            state: response.data.state ?? "open"
        };
    } catch (error) {
        logger.error(new Error(`Failed to fetch issue #${issue_number}`, { cause: error }));
        return null;
    }
}

async function compileFormPushEvent(octokit: Octokit, event: Event): Promise<string> {
    const commits = (event.payload as { commits?: Array<{ message?: string; sha?: string }> }).commits;
    const repoFullName = event.repo.name;
    const [owner, repo] = repoFullName.split('/');
    const messages: string[] = [];

    if (commits && Array.isArray(commits) && commits.length > 0) {
        for (const commit of commits) {
            if (commit.message) {
                messages.push("- " + commit.message);
            } else if (commit.sha) {
                const message = await fetchCommitMessage(octokit, owner, repo, commit.sha);
                if (message) {
                    messages.push("- " + message);
                }
            }
        }
    } else if ((event.payload as { head?: string }).head) {
        const message = await fetchCommitMessage(octokit, owner, repo, (event.payload as { head: string }).head);
        if (message) {
            messages.push("- " + message);
        }
    }

    return messages.join("\n");
}

async function parseEventTitle(octokit: Octokit, event: Event): Promise<string> {
    const repoFullName = event.repo.name;
    const [owner, repo] = repoFullName.split('/');

    if (event.payload.issue) {
        const issue = event.payload.issue;
        if (!issue.title && issue.number) {
            const details = await fetchIssueDetails(octokit, owner, repo, issue.number);
            if (details) {
                return `${details.title}`;
            }
        }
        return `${issue.title}`;
    } else { // @ts-expect-error
        if (event.payload.pull_request) {
            // @ts-expect-error
            const pr = event.payload.pull_request;
            if (!pr.title && pr.number) {
                const details = await fetchPullRequestDetails(octokit, owner, repo, pr.number);
                if (details) {
                    return `${details.title}`;
                }
            }
            return `${pr.title}`;
        } else {
            // @ts-expect-error
            const parsedEvent = parse(event);
            if (!parsedEvent) {
                return `${event.type} on ${event.repo.name}`;
            }
            // @ts-expect-error
            return compile(parsedEvent);
        }
    }
}

async function parseEventBody(octokit: Octokit, event: Event): Promise<string> {
    const payload = event.payload;
    const repoFullName = event.repo.name;
    const [owner, repo] = repoFullName.split('/');

    if (payload.comment) {
        return payload.comment.body ?? "";
    } else if (payload.issue) {
        if (payload.issue.body) {
            return payload.issue.body;
        }
        if (payload.issue.number) {
            const details = await fetchIssueDetails(octokit, owner, repo, payload.issue.number);
            return details?.body ?? "";
        }
        return "";
    } else if (event.type === "PushEvent") {
        return compileFormPushEvent(octokit, event);
    } else { // @ts-expect-error
        if (payload.pull_request) {
            // @ts-expect-error
            if (payload.pull_request.body) {
                // @ts-expect-error
                return payload.pull_request.body;
            }
            // @ts-expect-error
            if (payload.pull_request.number) {
                // @ts-expect-error
                const details = await fetchPullRequestDetails(octokit, owner, repo, payload.pull_request.number);
                return details?.body ?? "";
            }
            return "";
        }
    }
    return "";
}

function buildEventUrl(event: Event): string {
    const repoName = event.repo.name;
    const payload = event.payload;

    // @ts-expect-error
    if (payload.pull_request?.number) {
        // @ts-expect-error
        return `https://github.com/${repoName}/pull/${payload.pull_request.number}`;
    }

    if (payload.issue?.number) {
        return `https://github.com/${repoName}/issues/${payload.issue.number}`;
    }

    // @ts-expect-error
    if (event.type === "PushEvent" && payload.head) {
        // @ts-expect-error
        return `https://github.com/${repoName}/commit/${payload.head}`;
    }

    // @ts-expect-error
    if (payload.release?.html_url) {
        // @ts-expect-error
        return payload.release.html_url;
    }

    // @ts-expect-error
    const parsed = parse(event);
    return parsed?.html_url ?? `https://github.com/${repoName}`;
}

function getEventAction(event: Event): string | undefined {
    const payload = event.payload as { action?: string };
    return payload.action;
}

function getEventState(event: Event): string | undefined {
    if (event.payload.issue) {
        return event.payload.issue.state;
    }
    // @ts-expect-error
    if (event.payload.pull_request) {
        // @ts-expect-error
        return event.payload.pull_request.state;
    }
    return undefined;
}

function getEventNumber(event: Event): number | undefined {
    if (event.payload.issue) {
        return event.payload.issue.number;
    }
    // @ts-expect-error
    if (event.payload.pull_request) {
        // @ts-expect-error
        return event.payload.pull_request.number;
    }
    return undefined;
}

const convertEventToRecord = async (octokit: Octokit, event: Event): Promise<GitHubEventRecord> => {
    const title = await parseEventTitle(octokit, event);
    const body = await parseEventBody(octokit, event);
    const url = buildEventUrl(event);
    return {
        type: GitHubType,
        eventType: event.type ?? "Unknown",
        action: getEventAction(event),
        repo: event.repo.name,
        title,
        body: body || undefined,
        number: getEventNumber(event),
        state: getEventState(event),
        url,
        unixTimeMs: event.created_at ? new Date(event.created_at).getTime() : 0,
    }
}
export const fetchGitHubEvents = async (env: GitHubEnv, lastRecord: BaseRecord | null): Promise<GitHubEventRecord[]> => {
    const octokit = new Octokit({
        auth: env.github_token,
    });
    const events = await fetchUserEvents({
        github_username: env.github_username,
        GITHUB_TOKEN: env.github_token,
    });
    logger.info("GitHub Events count", events.length);
    const filteredResults = lastRecord
        ? collectUntil(events, lastRecord)
        : events;
    logger.info("filtered GitHub Events count", filteredResults.length)
    const records: GitHubEventRecord[] = [];
    for (const event of filteredResults) {
        const record = await convertEventToRecord(octokit, event);
        records.push(record);
    }
    return records;
}
