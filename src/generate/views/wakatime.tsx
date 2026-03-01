import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { formatTimeRange, toISO } from "./format.js";
import { getServiceIcon, inlineIcons } from "./icons.js";
import { groupConsecutive } from "./group.js";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

const formatDuration = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

type CodeStats = {
    humanAdditions: number;
    humanDeletions: number;
    aiAdditions: number;
    aiDeletions: number;
};

const sumStats = (entries: TimelineEntry[]): CodeStats => {
    let humanAdditions = 0;
    let humanDeletions = 0;
    let aiAdditions = 0;
    let aiDeletions = 0;
    for (const e of entries) {
        humanAdditions += (e as { humanAdditions?: number }).humanAdditions ?? 0;
        humanDeletions += (e as { humanDeletions?: number }).humanDeletions ?? 0;
        aiAdditions += (e as { aiAdditions?: number }).aiAdditions ?? 0;
        aiDeletions += (e as { aiDeletions?: number }).aiDeletions ?? 0;
    }
    return { humanAdditions, humanDeletions, aiAdditions, aiDeletions };
};

const formatStats = (stats: CodeStats): string => {
    const parts: string[] = [];
    const humanTotal = stats.humanAdditions + stats.humanDeletions;
    const aiTotal = stats.aiAdditions + stats.aiDeletions;
    if (humanTotal > 0) {
        parts.push(`+${stats.humanAdditions} -${stats.humanDeletions}`);
    }
    if (aiTotal > 0) {
        parts.push(`AI: +${stats.aiAdditions} -${stats.aiDeletions}`);
    }
    return parts.join(" / ");
};

const WakaTimeGroupView = ({ entries }: { entries: TimelineEntry[] }): string => {
    // entries are in ascending order (oldest first)
    const first = entries[0];
    const last = entries[entries.length - 1];
    const project = (first as { project?: string }).project ?? "unknown";
    const totalDuration = entries.reduce((sum, e) => sum + ((e as { duration?: number }).duration ?? 0), 0);
    const startMs = first.unixTimeMs;
    const endMs = last.unixTimeMs + ((last as { duration?: number }).duration ?? 0) * 1000;
    const timeStr = formatTimeRange(startMs, endMs);
    const stats = sumStats(entries);
    const statsStr = formatStats(stats);

    const bodyHtml = `<span class="inline-icon">${inlineIcons.code}</span>${project} (${formatDuration(totalDuration)})`;

    return (
        <article class="timeline-entry timeline-entry--wakatime">
            <time class="entry-time" datetime={toISO(startMs)} data-end={toISO(endMs)}>{timeStr}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("wakatime")} WakaTime` }}></span>
            <span class="entry-body" dangerouslySetInnerHTML={{ __html: bodyHtml }}></span>
            {statsStr ? <div class="entry-meta">{statsStr}</div> : ""}
        </article>
    );
};

export const wakatimeView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        // Sort ascending by time for grouping
        const sorted = [...records].sort((a, b) => a.unixTimeMs - b.unixTimeMs);

        const groups = groupConsecutive(sorted, (a, b) => {
            const aProject = (a as { project?: string }).project ?? "";
            const bProject = (b as { project?: string }).project ?? "";
            if (aProject !== bProject) return false;
            const aDuration = ((a as { duration?: number }).duration ?? 0) * 1000;
            const gap = b.unixTimeMs - (a.unixTimeMs + aDuration);
            return gap <= THIRTY_MINUTES_MS;
        });

        return groups.map((group) => {
            const latest = group[group.length - 1];
            return {
                html: WakaTimeGroupView({ entries: group }),
                unixTimeMs: latest.unixTimeMs,
            };
        });
    },
};
