import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime, toISO } from "./format.js";
import { getServiceIcon } from "./icons.js";

const NotionEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const title = (entry as { title?: string }).title ?? "";
    const url = entry.url ? safeUrl(entry.url) : null;

    return (
        <article class="timeline-entry timeline-entry--notion">
            <time class="entry-time" datetime={toISO(entry.unixTimeMs)}>{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("notion")} Notion` }}></span>
            <span class="entry-body">
                {url
                    ? <a href={url} target="_blank" rel="noopener noreferrer">{title}</a>
                    : title}
            </span>
        </article>
    );
};

export const notionView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: NotionEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
