import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { formatTime, formatTimeRange, toISO } from "./format.js";
import { getServiceIcon } from "./icons.js";

const formatDuration = (seconds: number): string => {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const formatScore = (label: string, score: unknown): string => {
    return `${label}: ${typeof score === "number" ? score : "–"}`;
};

const OuraEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const dataType = (entry as { dataType?: string }).dataType ?? "unknown";
    const score = (entry as { score?: number | null }).score;
    const steps = (entry as { steps?: number | null }).steps;
    const activeCalories = (entry as { activeCalories?: number | null }).activeCalories;
    const temperatureDeviation = (entry as { temperatureDeviation?: number | null }).temperatureDeviation;
    const durationSeconds = (entry as { durationSeconds?: number | null }).durationSeconds;
    const averageHeartRate = (entry as { averageHeartRate?: number | null }).averageHeartRate;
    const averageHrv = (entry as { averageHrv?: number | null }).averageHrv;
    const bedtimeStart = (entry as { bedtimeStart?: string | null }).bedtimeStart;
    const bedtimeEnd = (entry as { bedtimeEnd?: string | null }).bedtimeEnd;
    const sleepType = (entry as { sleepType?: string | null }).sleepType;

    let body = "Oura";
    const meta: string[] = [];
    if (dataType === "daily_activity") {
        body = formatScore("Activity", score);
        if (typeof steps === "number") meta.push(`${steps.toLocaleString("en-US")} steps`);
        if (typeof activeCalories === "number") meta.push(`${activeCalories} active kcal`);
    } else if (dataType === "daily_readiness") {
        body = formatScore("Readiness", score);
        if (typeof temperatureDeviation === "number") {
            meta.push(`temperature ${temperatureDeviation >= 0 ? "+" : ""}${temperatureDeviation.toFixed(1)}°C`);
        }
    } else if (dataType === "daily_sleep") {
        body = formatScore("Sleep", score);
    } else if (dataType === "sleep") {
        const label = sleepType === "deleted"
            ? "Deleted sleep record"
            : sleepType === "rest"
                ? "Rest (not sleep)"
                : sleepType === "late_nap"
                    ? "Late nap"
                    : sleepType === "long_sleep"
                        ? "Long sleep"
                        : "Sleep";
        body = `${label}${sleepType !== "deleted" && typeof durationSeconds === "number" ? `: ${formatDuration(durationSeconds)}` : ""}`;
        if (sleepType !== "deleted" && typeof averageHeartRate === "number") {
            meta.push(`avg HR ${Math.round(averageHeartRate)} bpm`);
        }
        if (sleepType !== "deleted" && typeof averageHrv === "number") meta.push(`avg HRV ${averageHrv} ms`);
    }

    const startMs = bedtimeStart ? new Date(bedtimeStart).getTime() : Number.NaN;
    const endMs = bedtimeEnd ? new Date(bedtimeEnd).getTime() : Number.NaN;
    const hasSleepRange = !Number.isNaN(startMs) && !Number.isNaN(endMs);
    const time = hasSleepRange ? formatTimeRange(startMs, endMs) : formatTime(entry.unixTimeMs);

    return (
        <article class="timeline-entry timeline-entry--oura">
            <time
                class="entry-time"
                datetime={toISO(hasSleepRange ? startMs : entry.unixTimeMs)}
                data-end={hasSleepRange ? toISO(endMs) : undefined}
            >{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("oura")} Oura` }}></span>
            <span class="entry-body">{body}</span>
            {meta.length > 0 ? <div class="entry-meta">{meta.join(" · ")}</div> : ""}
        </article>
    );
};

export const ouraView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: OuraEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
