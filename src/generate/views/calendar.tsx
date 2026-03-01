import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime, formatTimeRange, toISO } from "./format.js";
import { getServiceIcon } from "./icons.js";

const CalendarEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const endMs = (entry as { endUnixTimeMs?: number }).endUnixTimeMs;
    const timeStr = endMs ? formatTimeRange(entry.unixTimeMs, endMs) : formatTime(entry.unixTimeMs);
    const summary = (entry as { summary?: string }).summary ?? "";
    const url = entry.url ? safeUrl(entry.url) : null;

    return (
        <article class="timeline-entry timeline-entry--calendar">
            <time class="entry-time" datetime={toISO(entry.unixTimeMs)} data-end={endMs ? toISO(endMs) : undefined}>{timeStr}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("calendar")} Calendar` }}></span>
            <span class="entry-body">{summary}</span>
            {url ? <div class="entry-link"><a href={url} target="_blank" rel="noopener noreferrer">View event</a></div> : ""}
        </article>
    );
};

export const calendarView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: CalendarEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
