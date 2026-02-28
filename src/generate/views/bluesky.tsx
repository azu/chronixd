import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime } from "./format.js";
import { getServiceIcon } from "./icons.js";
import { autolinkUrls } from "./autolink.js";

const BlueskyEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const text = (entry as { text?: string }).text ?? "";
    const textHtml = autolinkUrls(text);
    const parentUrl = safeUrl((entry as { parentUrl?: string }).parentUrl ?? "");
    const postUrl = entry.url ? safeUrl(entry.url) : null;

    return (
        <article class="timeline-entry timeline-entry--bluesky">
            <time class="entry-time">{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("bluesky")} Bluesky` }}></span>
            {parentUrl ? <div class="entry-meta" dangerouslySetInnerHTML={{ __html: `Reply to <a href="${parentUrl}" target="_blank" rel="noopener noreferrer">${parentUrl}</a>` }}></div> : ""}
            <div class="entry-body" dangerouslySetInnerHTML={{ __html: textHtml }}></div>
            {postUrl ? <div class="entry-link"><a href={postUrl} target="_blank" rel="noopener noreferrer">View post</a></div> : ""}
        </article>
    );
};

export const blueskyView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: BlueskyEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
