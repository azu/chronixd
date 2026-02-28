import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime } from "./format.js";
import { getServiceIcon } from "./icons.js";

const BookmarkEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const title = (entry as { title?: string }).title ?? "";
    const tags = (entry as { tags?: string[] }).tags ?? [];
    const url = entry.url ? safeUrl(entry.url) : null;

    return (
        <article class="timeline-entry timeline-entry--bookmark">
            <time class="entry-time">{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("bookmark")} Bookmark` }}></span>
            {url
                ? <span class="entry-body"><a href={url} target="_blank" rel="noopener noreferrer">{title || url}</a></span>
                : <span class="entry-body">{title}</span>}
            {tags.length > 0
                ? <div class="entry-meta">{tags.join(", ")}</div>
                : ""}
        </article>
    );
};

export const bookmarkView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: BookmarkEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
