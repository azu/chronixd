import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime } from "./format.js";
import { getServiceIcon } from "./icons.js";

const formatEventLine = (entry: TimelineEntry): string => {
    const eventType = (entry as { eventType?: string }).eventType ?? (entry as { resultType?: string }).resultType ?? "";
    const title = (entry as { title?: string }).title ?? (entry as { issueTitle?: string }).issueTitle ?? "";
    const number = (entry as { number?: number }).number;
    const url = entry.url ? safeUrl(entry.url) : null;

    const label = title
        ? `${eventType}: ${title}${number ? ` #${number}` : ""}`
        : `${eventType}${number ? ` #${number}` : ""}`;

    if (url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
};

const GitHubGroupView = ({ repo, entries }: { repo: string; entries: TimelineEntry[] }): string => {
    // entries are descending (newest first)
    const time = formatTime(entries[0].unixTimeMs);
    const eventLines = entries.map(formatEventLine);

    return (
        <article class="timeline-entry timeline-entry--github">
            <time class="entry-time">{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("github")} GitHub` }}></span>
            <span class="entry-body">{repo}</span>
            <ul class="entry-list" dangerouslySetInnerHTML={{ __html: eventLines.map((line) => `<li>${line}</li>`).join("") }}></ul>
        </article>
    );
};

export const githubView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        // Group by repo
        const byRepo = new Map<string, TimelineEntry[]>();
        for (const entry of records) {
            const repo = (entry as { repo?: string }).repo ?? (entry as { nameWithOwner?: string }).nameWithOwner ?? "unknown";
            const existing = byRepo.get(repo);
            if (existing) {
                existing.push(entry);
            } else {
                byRepo.set(repo, [entry]);
            }
        }

        return Array.from(byRepo.entries()).map(([repo, entries]) => {
            // Sort descending within group
            entries.sort((a, b) => b.unixTimeMs - a.unixTimeMs);
            return {
                html: GitHubGroupView({ repo, entries }),
                unixTimeMs: entries[0].unixTimeMs,
            };
        });
    },
};
