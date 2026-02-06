import { BaseRecord, GitHubSearchRecord } from "../common/types.js";
import { graphql, GraphqlResponseError } from "@octokit/graphql";
import { SearchResultItemConnection } from "@octokit/graphql-schema";
import { createLogger } from "../common/logger.js";
import { RetryAbleError } from "../common/RetryAbleError.js";
import { createCache } from "../common/cache.ts";

const logger = createLogger("GitHubSearch");
export type GitHubSearchEnv = {
    github_token: string;
    github_search_query: string;
    github_search_type: "ISSUE" | "REPOSITORY";
};
export const isGitHubSearchEnv = (env: unknown): env is GitHubSearchEnv => {
    return typeof (env as GitHubSearchEnv).github_token === "string" && typeof (env as GitHubSearchEnv).github_search_query === "string";
}
export const GitHubSearchType = "GitHubSearch" as const;
type SearchResultRepo = {
    __typename: "Repository";
    id: string;
    url: string;
    name: string;
    nameWithOwner: string;
    createdAt: string;
    updatedAt: string;
    description: string;
    owner: {
        avatarUrl: string;
        login: string;
        url: string;
    };
}
type SearchResultIssueOrPullRequest = {
    __typename: "PullRequest" | "Issue";
    id: string;
    number: number;
    url: string;
    title: string;
    createdAt: string;
    updatedAt: string;

    state: "OPEN" | "CLOSED" | "MERGED";
    author: {
        login: string;
    };
    repository: {
        nameWithOwner: string;
    }
    comments: {
        nodes: {
            body: string;
            url: string;
        }[];
    }
}
type SearchResultItem = SearchResultRepo | SearchResultIssueOrPullRequest;
export const searchGithub = ({
                                 query,
                                 size,
                                 type,
                                 GITHUB_TOKEN
                             }: {
    query: string,
    size: number;
    type: GitHubSearchEnv["github_search_type"];
    GITHUB_TOKEN: string
}): Promise<SearchResultItem[]> => {
    return graphql<{ search: SearchResultItemConnection }>(
        `query ($QUERY: String!, $TYPE: SearchType!, $SIZE: Int!) {
  search(query: $QUERY, type: $TYPE, first: $SIZE) {
    edges {
      node {
        __typename
        ... on Repository {
          id
          url
          name
          nameWithOwner
          createdAt
          updatedAt
        }
        ... on PullRequest {
          id
          number
          url
          title
          createdAt
          updatedAt
          state
          author {
            login
          }
          repository {
            nameWithOwner
          }
          comments(last: 1) {
            nodes {
              url
            }
          }
        }
        ... on Issue {
          id
          number
          url
          title
          createdAt
          updatedAt
          state
          author {
            avatarUrl
            login
            url
          }
          repository {
            nameWithOwner
          }
          comments(last: 1) {
            nodes {
              url
            }
          }
        }
      }
    }
  }
}`,
        {
            QUERY: query,
            TYPE: type,
            SIZE: size,
            headers: {
                authorization: `token ${GITHUB_TOKEN}`
            }
        }
    ).then((result) => {
        return (result.search.edges?.flatMap((edge) => {
            return edge?.node ? [edge.node] : [];
        }) ?? []) as SearchResultItem[];
    }).catch((error) => {
        if (error instanceof GraphqlResponseError) {
            const statusCode = Number(error.headers.status ?? 0);
            if (statusCode >= 500 && statusCode < 600) {
                throw new RetryAbleError("Retryable error on GitHub Search", {
                    cause: error,
                });
            }
        }
        throw error;
    });
};

type RelativeDateUnit = "day" | "month" | "year";
const relativeDate = (value: number, unit: RelativeDateUnit): Date => {
    const now = new Date();
    if (unit === "year") {
        return new Date(now.getFullYear() + value, now.getMonth(), now.getDate());
    } else if (unit === "month") {
        return new Date(now.getFullYear(), now.getMonth() + value, now.getDate());
    } else if (unit === "day") {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + value);
    }
    throw new Error("invalid unit");
}
const formatYYYYMMDD = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const parserFunction = (searchQuery: string) => {
    const relativeFunctionRegExp = /{{(?<operator>\+|-)?(?<value>\d+)(?<unit>day|month|year)}}/g;
    const relativeFunctionMatch = searchQuery.matchAll(relativeFunctionRegExp);
    for (const match of [...relativeFunctionMatch].reverse()) {
        const { operator, value, unit } = match.groups!;
        const relativeDateValue = relativeDate(Number(`${operator}${value}`), unit as RelativeDateUnit);
        searchQuery = searchQuery.substring(0, match.index)
            + formatYYYYMMDD(relativeDateValue)
            + searchQuery.substring(match.index! + match[0].length);
    }
    const todayRegExp = /{{today}}/g;
    const todayMatch = searchQuery.matchAll(todayRegExp);
    for (const match of [...todayMatch].reverse()) {
        searchQuery = searchQuery.substring(0, match.index)
            + formatYYYYMMDD(new Date())
            + searchQuery.substring(match.index! + match[0].length);
    }
    return searchQuery;
}
export const collectUntil = (searchResults: SearchResultItem[], lastRecord: BaseRecord): SearchResultItem[] => {
    const filteredResults: SearchResultItem[] = [];
    try {
        for (const result of searchResults) {
            const updatedAtTime = new Date(result.updatedAt).getTime();
            if (lastRecord.unixTimeMs < updatedAtTime) {
                filteredResults.push(result);
            } else {
                return filteredResults;
            }
        }
    } catch (error) {
        logger.error(new Error("collect error", {
            cause: error,
        }));
        throw new Error("collect error at github search");
    }
    return filteredResults;
};

const convertSearchResultToRecord = (result: SearchResultItem): GitHubSearchRecord => {
    switch (result.__typename) {
        case "Repository":
            return {
                type: GitHubSearchType,
                resultType: "Repository",
                nameWithOwner: result.nameWithOwner,
                url: result.url,
                unixTimeMs: new Date(result.updatedAt).getTime(),
            }
        case "PullRequest":
            return {
                type: GitHubSearchType,
                resultType: "PullRequest",
                nameWithOwner: result.repository.nameWithOwner,
                title: result.title,
                state: result.state,
                author: result.author?.login,
                number: result.number,
                url: result.comments.nodes.length > 0 ? result.comments.nodes[0].url : result.url,
                unixTimeMs: new Date(result.updatedAt).getTime(),
            }
        case "Issue":
            return {
                type: GitHubSearchType,
                resultType: "Issue",
                nameWithOwner: result.repository.nameWithOwner,
                title: result.title,
                state: result.state,
                author: result.author?.login,
                number: result.number,
                url: result.comments.nodes.length > 0 ? result.comments.nodes[0].url : result.url,
                unixTimeMs: new Date(result.updatedAt).getTime(),
            }
    }
    throw new Error("unknown type: " + (result as { __typename: never }).__typename)
}
const IGNORE_AUTHOR = ["dependabot-preview[bot]", "renovate", "dependabot[bot]"];
export const fetchGitHubSearch = async (env: GitHubSearchEnv, _lastRecord: BaseRecord | null): Promise<GitHubSearchRecord[]> => {
    const searchResults = await searchGithub({
        query: parserFunction(env.github_search_query),
        type: env.github_search_type,
        GITHUB_TOKEN: env.github_token,
        size: 20
    });
    const cache = createCache<SearchResultItem>("github_search.json");
    const cachedEvents = await cache.read();
    logger.info("searchResults count", searchResults.length);
    const filteredResults = searchResults.filter((result) => {
        if (cachedEvents.some((cachedEvent) => cachedEvent.id === result.id)) {
            return false;
        }
        if (result.__typename === "Issue" || result.__typename === "PullRequest") {
            return !IGNORE_AUTHOR.includes(result?.author?.login);
        }
        return true;
    })
    logger.info("filtered results count", filteredResults.length)
    await cache.write(cachedEvents.concat(filteredResults));
    return filteredResults.map(convertSearchResultToRecord);
}
