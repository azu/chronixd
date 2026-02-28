import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime } from "./format.js";

const DefaultEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const typeBadge = <span class="entry-badge">{entry.type}</span>;
    const url = entry.url ? safeUrl(entry.url) : null;
    const link = url
        ? <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        : null;

    return (
        <article class="timeline-entry">
            <time class="entry-time">{time}</time>
            {typeBadge}
            <span class="entry-service">{entry.service}/{entry.sourceName}</span>
            {link ? <div class="entry-link" dangerouslySetInnerHTML={{ __html: link }}></div> : ""}
        </article>
    );
};

export const defaultView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: DefaultEntryView({ entry }),
        }));
    },
};
