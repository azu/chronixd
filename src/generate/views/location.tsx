import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { formatTime } from "./format.js";

const LocationGroupView = ({ entries }: { entries: TimelineEntry[] }): string => {
    const first = entries[0];
    const last = entries[entries.length - 1];
    const startTime = formatTime(last.unixTimeMs); // entries are desc, last = earliest
    const endTime = formatTime(first.unixTimeMs);
    const uniqueAddresses = [...new Set(entries.map((e) => (e as { address?: string }).address).filter(Boolean))];
    const uniquePois = [...new Set(entries.map((e) => (e as { poi?: string }).poi).filter(Boolean))];

    return (
        <article class="timeline-entry timeline-entry--location">
            <time class="entry-time">{startTime} - {endTime}</time>
            <span class="entry-badge">Location</span>
            <span class="entry-meta">{entries.length} points</span>
            {uniquePois.length > 0
                ? <div class="entry-body">{uniquePois.join(", ")}</div>
                : ""}
            {uniqueAddresses.length > 0
                ? <div class="entry-meta">{uniqueAddresses.join("; ")}</div>
                : ""}
        </article>
    );
};

export const locationView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        // Group consecutive location records into a single view
        return [{
            html: LocationGroupView({ entries: records }),
        }];
    },
};
