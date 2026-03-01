import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime, toISO } from "./format.js";
import { getServiceIcon } from "./icons.js";

const formatActivity = (entry: TimelineEntry): string => {
    const activityType = (entry as { activityType?: string }).activityType ?? "";
    const fromState = (entry as { fromState?: string }).fromState;
    const toState = (entry as { toState?: string }).toState;
    if (activityType === "status_change" && fromState && toState) {
        return `${fromState} → ${toState}`;
    }
    return activityType;
};

const LinearEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const identifier = (entry as { identifier?: string }).identifier;
    const issueTitle = (entry as { issueTitle?: string }).issueTitle ?? "";
    const title = identifier ? `[${identifier}] ${issueTitle}` : issueTitle;
    const activity = formatActivity(entry);
    const url = entry.url ? safeUrl(entry.url) : null;

    return (
        <article class="timeline-entry timeline-entry--linear">
            <time class="entry-time" datetime={toISO(entry.unixTimeMs)}>{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("linear")} Linear` }}></span>
            <span class="entry-body">{title}</span>
            {activity ? <div class="entry-meta">{activity}</div> : ""}
            {url ? <div class="entry-link"><a href={url} target="_blank" rel="noopener noreferrer">View issue</a></div> : ""}
        </article>
    );
};

export const linearView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: LinearEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
