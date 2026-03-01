import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import { formatTimeRange, toISO } from "./format.js";
import { getServiceIcon } from "./icons.js";
import { groupConsecutive } from "./group.js";

const MOVING_SPEED_THRESHOLD = 1.0; // m/s
const LocationIcon = getServiceIcon("location");

const getLocationKey = (entry: TimelineEntry): string | null => {
    const poi = (entry as { poi?: string }).poi;
    if (poi) return poi;
    const address = (entry as { address?: string }).address;
    if (address) return address;
    return null;
};

const isMoving = (entry: TimelineEntry): boolean => {
    const speed = (entry as { speed?: number }).speed;
    if (speed !== undefined && speed > MOVING_SPEED_THRESHOLD) return true;
    return getLocationKey(entry) === null;
};

const buildMapData = (entries: TimelineEntry[]): string => {
    const points = entries.map((e) => {
        const lat = (e as { latitude?: number }).latitude;
        const lng = (e as { longitude?: number }).longitude;
        if (lat === undefined || lng === undefined) return null;
        return [lat, lng];
    }).filter(Boolean);
    return JSON.stringify(points);
};

const getDisplayName = (entries: TimelineEntry[]): string => {
    const pois = [...new Set(entries.map((e) => (e as { poi?: string }).poi).filter(Boolean))];
    if (pois.length > 0) return pois.join(", ");
    const addresses = [...new Set(entries.map((e) => (e as { address?: string }).address).filter(Boolean))];
    if (addresses.length > 0) return addresses.join("; ");
    return "";
};

type LocationGroup = {
    type: "stay" | "moving";
    entries: TimelineEntry[];
};

const classifyGroups = (entries: TimelineEntry[]): LocationGroup[] => {
    const sorted = [...entries].sort((a, b) => a.unixTimeMs - b.unixTimeMs);

    const rawGroups = groupConsecutive(sorted, (a, b) => {
        const aMoving = isMoving(a);
        const bMoving = isMoving(b);
        if (aMoving && bMoving) return true;
        if (aMoving !== bMoving) return false;
        const aKey = getLocationKey(a);
        const bKey = getLocationKey(b);
        if (aKey === null || bKey === null) return false;
        return aKey === bKey;
    });

    return rawGroups.map((group) => {
        const movingCount = group.filter(isMoving).length;
        return {
            type: movingCount > group.length / 2 ? "moving" : "stay",
            entries: group,
        } satisfies LocationGroup;
    });
};

const StayView = ({ group }: { group: LocationGroup }): string => {
    const first = group.entries[0];
    const last = group.entries[group.entries.length - 1];
    const timeStr = formatTimeRange(first.unixTimeMs, last.unixTimeMs);
    const name = getDisplayName(group.entries);
    const mapData = buildMapData(group.entries);

    return (
        <article class="timeline-entry timeline-entry--location">
            <time class="entry-time" datetime={toISO(first.unixTimeMs)} data-end={toISO(last.unixTimeMs)}>{timeStr}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${LocationIcon} Location` }}></span>
            <span class="entry-body">{name || `${group.entries.length} points`}</span>
            <div class="location-map" dangerouslySetInnerHTML={{ __html: `<div data-location-points='${mapData}'></div>` }}></div>
        </article>
    );
};

const MovingView = ({ group, prev, next }: { group: LocationGroup; prev?: LocationGroup; next?: LocationGroup }): string => {
    const first = group.entries[0];
    const last = group.entries[group.entries.length - 1];
    const timeStr = formatTimeRange(first.unixTimeMs, last.unixTimeMs);
    const fromName = prev ? getDisplayName(prev.entries) : "";
    const toName = next ? getDisplayName(next.entries) : "";
    const label = fromName && toName ? `${fromName} → ${toName}` : "移動中";

    return (
        <article class="timeline-entry timeline-entry--location timeline-entry--moving">
            <time class="entry-time" datetime={toISO(first.unixTimeMs)} data-end={toISO(last.unixTimeMs)}>{timeStr}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${LocationIcon} Location` }}></span>
            <span class="entry-body">{label}</span>
        </article>
    );
};

export const locationView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        if (records.length === 0) return [];
        const groups = classifyGroups(records);

        return groups.map((group, i) => {
            const html = group.type === "moving"
                ? MovingView({
                    group,
                    prev: i > 0 ? groups[i - 1] : undefined,
                    next: i < groups.length - 1 ? groups[i + 1] : undefined,
                })
                : StayView({ group });

            return {
                html,
                unixTimeMs: group.entries[group.entries.length - 1].unixTimeMs,
            };
        });
    },
};
