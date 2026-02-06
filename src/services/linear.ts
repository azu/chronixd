import { BaseRecord, LinearRecord, ServiceDefinition } from "../common/types.js";
import { createLogger } from "../common/logger.js";
import { createCache } from "../common/cache.ts";

const logger = createLogger("Linear");
export type LinearEnv = {
    linear_token: string;
    linear_search_type: "assigned_me" | "created_by_me" | "activity";
};
export const LinearType = "Linear" as const;
const priorityLabels = ["None", "Urgent", "High", "Medium", "Low"];
export const isLinearEnv = (env: unknown): env is LinearEnv => {
    return typeof (env as LinearEnv).linear_token === "string" && typeof (env as LinearEnv).linear_search_type === "string";
}
type LinearRecordWithId = LinearRecord & { id: string };
type IssueNode = {
    id: string;
    title: string;
    url: string;
    updatedAt: string;
    createdAt: string;
    estimate: number | null;
    identifier: string;
    priority: number;
    labels: { nodes: { name: string }[] };
};
type searchAssignedIssuesResponse = {
    data: {
        viewer: {
            assignedIssues: {
                nodes: IssueNode[];
            };
        };
    };
};
type searchCreatedIssuesResponse = {
    data: {
        viewer: {
            createdIssues: {
                nodes: IssueNode[];
            };
        };
    };
};

type CommentNode = {
    id: string;
    body: string;
    createdAt: string;
    issue: {
        id: string;
        title: string;
        url: string;
        estimate: number | null;
        identifier: string;
        priority: number;
        labels: { nodes: { name: string }[] };
    } | null;
};
type CommentsResponse = {
    data: {
        comments: {
            nodes: CommentNode[];
        };
    };
    errors?: Array<{ message: string }>;
};
type HistoryNode = {
    id: string;
    createdAt: string;
    actor: {
        id: string;
        isMe: boolean;
        name: string;
    } | null;
    fromState: { name: string } | null;
    toState: { name: string } | null;
    fromAssignee: { name: string } | null;
    toAssignee: { name: string } | null;
    fromPriority: number | null;
    toPriority: number | null;
};
type IssueWithHistory = {
    id: string;
    title: string;
    url: string;
    estimate: number | null;
    identifier: string;
    priority: number;
    labels: { nodes: { name: string }[] };
    history: {
        nodes: HistoryNode[];
    };
};
type IssueHistoryResponse = {
    data: {
        viewer: {
            assignedIssues: {
                nodes: IssueWithHistory[];
            };
        };
    };
    errors?: Array<{ message: string }>;
};
async function searchAssignedIssues({ token }: { token: string }): Promise<LinearRecordWithId[]> {
    const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${token}`,
        },
        body: JSON.stringify({
            query: `query {
  viewer {
    assignedIssues(orderBy: updatedAt, first: 20, filter: {
        state: {
          type: {
            eq: "started"
          }
        }
    }){
      nodes {
        id
        title
        url
        updatedAt
        estimate
        identifier
        priority
        labels { nodes { name } }
      }
    }
  }
}`
        })
    });
    if (!res.ok) {
        throw new Error("failed to fetch linear issues");
    }
    const json = await res.json() as searchAssignedIssuesResponse;
    return json.data.viewer.assignedIssues.nodes.map((node) => {
        return {
            id: node.id,
            type: LinearType,
            activityType: "assigned" as const,
            issueTitle: node.title,
            url: node.url,
            unixTimeMs: new Date(node.updatedAt).getTime(),
            estimate: node.estimate ?? undefined,
            identifier: node.identifier,
            priority: node.priority,
            labels: node.labels.nodes.map(l => l.name),
        };
    });
}

async function searchCreatedByMe({ token }: { token: string }): Promise<LinearRecordWithId[]> {
    const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${token}`,
        },
        body: JSON.stringify({
            query: `query {
  viewer {
    createdIssues(orderBy: updatedAt, first: 20, filter: {
        state: {
          type: {
            eq: "started"
          }
        }
    }){
      nodes {
        id
        title
        url
        updatedAt
        estimate
        identifier
        priority
        labels { nodes { name } }
      }
    }
  }
}`
        })
    });
    if (!res.ok) {
        throw new Error("failed to fetch linear issues");
    }
    const json = await res.json() as searchCreatedIssuesResponse;
    return json.data.viewer.createdIssues.nodes.map((node) => {
        return {
            id: node.id,
            type: LinearType,
            activityType: "created" as const,
            issueTitle: node.title,
            url: node.url,
            unixTimeMs: new Date(node.updatedAt).getTime(),
            estimate: node.estimate ?? undefined,
            identifier: node.identifier,
            priority: node.priority,
            labels: node.labels.nodes.map(l => l.name),
        };
    });
}

async function searchMyComments({ token }: { token: string }): Promise<LinearRecordWithId[]> {
    const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${token}`,
        },
        body: JSON.stringify({
            query: `query {
  comments(filter: { user: { isMe: { eq: true } } }, first: 50, orderBy: createdAt) {
    nodes {
      id
      body
      createdAt
      issue { id title url estimate identifier priority labels { nodes { name } } }
    }
  }
}`
        })
    });
    if (!res.ok) {
        throw new Error("failed to fetch linear comments");
    }
    const json = await res.json() as CommentsResponse;
    if (json.errors) {
        logger.warn("comments query failed, trying fallback", json.errors);
        return [];
    }
    return json.data.comments.nodes.flatMap((node) => {
        if (node.issue === null) return [];
        return [{
            id: `comment-${node.id}`,
            type: LinearType,
            activityType: "comment" as const,
            issueTitle: node.issue.title,
            body: node.body,
            url: node.issue.url,
            unixTimeMs: new Date(node.createdAt).getTime(),
            estimate: node.issue.estimate ?? undefined,
            identifier: node.issue.identifier,
            priority: node.issue.priority,
            labels: node.issue.labels.nodes.map(l => l.name),
        }];
    });
}

async function searchMyIssueHistory({ token }: { token: string }): Promise<LinearRecordWithId[]> {
    const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${token}`,
        },
        body: JSON.stringify({
            query: `query {
  viewer {
    assignedIssues(first: 20, orderBy: updatedAt) {
      nodes {
        id
        title
        url
        estimate
        identifier
        priority
        labels { nodes { name } }
        history(first: 10) {
          nodes {
            id
            createdAt
            actor { id isMe name }
            fromState { name }
            toState { name }
            fromAssignee { name }
            toAssignee { name }
            fromPriority
            toPriority
          }
        }
      }
    }
  }
}`
        })
    });
    if (!res.ok) {
        throw new Error("failed to fetch linear issue history");
    }
    const json = await res.json() as IssueHistoryResponse;
    if (json.errors) {
        logger.warn("issue history query failed", json.errors);
        return [];
    }
    const results: LinearRecordWithId[] = [];
    for (const issue of json.data.viewer.assignedIssues.nodes) {
        for (const history of issue.history.nodes) {
            const issueFields = {
                estimate: issue.estimate ?? undefined,
                identifier: issue.identifier,
                priority: issue.priority,
                labels: issue.labels.nodes.map(l => l.name),
            };

            // assign_change is recorded regardless of actor (to capture "assigned to me by others")
            if (history.fromAssignee || history.toAssignee) {
                const from = history.fromAssignee?.name ?? "Unassigned";
                const to = history.toAssignee?.name ?? "Unassigned";
                results.push({
                    id: `history-assign-${history.id}`,
                    type: LinearType,
                    activityType: "assign_change",
                    issueTitle: issue.title,
                    fromState: from,
                    toState: to,
                    url: issue.url,
                    unixTimeMs: new Date(history.createdAt).getTime(),
                    ...issueFields,
                });
                continue;
            }

            // other history types require actor to be the current user
            if (!history.actor?.isMe) continue;

            if (history.fromState && history.toState) {
                results.push({
                    id: `history-state-${history.id}`,
                    type: LinearType,
                    activityType: "status_change",
                    issueTitle: issue.title,
                    fromState: history.fromState.name,
                    toState: history.toState.name,
                    url: issue.url,
                    unixTimeMs: new Date(history.createdAt).getTime(),
                    ...issueFields,
                });
                continue;
            }

            if (history.fromPriority !== null || history.toPriority !== null) {
                const from = priorityLabels[history.fromPriority ?? 0] ?? String(history.fromPriority);
                const to = priorityLabels[history.toPriority ?? 0] ?? String(history.toPriority);
                results.push({
                    id: `history-priority-${history.id}`,
                    type: LinearType,
                    activityType: "priority_change",
                    issueTitle: issue.title,
                    fromState: from,
                    toState: to,
                    url: issue.url,
                    unixTimeMs: new Date(history.createdAt).getTime(),
                    ...issueFields,
                });
                continue;
            }
        }
    }
    return results;
}

async function searchMyCreatedIssues({ token }: { token: string }): Promise<LinearRecordWithId[]> {
    const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `${token}`,
        },
        body: JSON.stringify({
            query: `query {
  viewer {
    createdIssues(first: 20, orderBy: createdAt) {
      nodes {
        id
        title
        url
        createdAt
        estimate
        identifier
        priority
        labels { nodes { name } }
      }
    }
  }
}`
        })
    });
    if (!res.ok) {
        throw new Error("failed to fetch linear created issues");
    }
    const json = await res.json() as searchCreatedIssuesResponse;
    return json.data.viewer.createdIssues.nodes.map((node) => {
        return {
            id: `created-${node.id}`,
            type: LinearType,
            activityType: "created" as const,
            issueTitle: node.title,
            url: node.url,
            unixTimeMs: new Date(node.createdAt).getTime(),
            estimate: node.estimate ?? undefined,
            identifier: node.identifier,
            priority: node.priority,
            labels: node.labels.nodes.map(l => l.name),
        };
    });
}

async function searchActivity({ token }: { token: string }): Promise<LinearRecordWithId[]> {
    const [comments, history, created, assigned] = await Promise.all([
        searchMyComments({ token }),
        searchMyIssueHistory({ token }),
        searchMyCreatedIssues({ token }),
        searchAssignedIssues({ token }),
    ]);
    return [...comments, ...history, ...created, ...assigned].toSorted((a, b) => b.unixTimeMs - a.unixTimeMs);
}

async function searchLinear({ type, token }: {
    type: LinearEnv["linear_search_type"],
    token: string
}): Promise<LinearRecordWithId[]> {
    if (type === "assigned_me") {
        return searchAssignedIssues({ token });
    } else if (type === "created_by_me") {
        return searchCreatedByMe({ token });
    } else if (type === "activity") {
        return searchActivity({ token });
    }
    throw new Error("invalid type: " + (type satisfies never));
}

export const fetchLinear = async (env: LinearEnv, _lastRecord: BaseRecord | null): Promise<LinearRecord[]> => {
    const searchResults = await searchLinear({
        type: env.linear_search_type,
        token: env.linear_token,
    });
    const cache = createCache<LinearRecordWithId>("linear.json", { maxItems: 10000 });
    const cachedEvents = await cache.read();
    logger.info("searchResults count", searchResults.length);
    const filteredResults = searchResults.filter((result) => {
        return !cachedEvents.some((cachedEvent) => cachedEvent.id === result.id);

    })
    logger.info("filtered results count", filteredResults.length)
    await cache.write(cachedEvents.concat(filteredResults));
    return filteredResults;
}

export const linearService: ServiceDefinition = {
    writeMode: "append",
    isEnv: isLinearEnv,
    fetch: (env, lastRecord) => fetchLinear(env, lastRecord),
};
