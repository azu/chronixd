import { getDateContext } from "../date-context.js";

export const formatTime = (unixTimeMs: number): string => {
    const { timezone } = getDateContext();
    const formatter = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: timezone,
    });
    return formatter.format(new Date(unixTimeMs));
};

export const formatTimeRange = (startMs: number, endMs: number): string => {
    return `${formatTime(startMs)} - ${formatTime(endMs)}`;
};

export const toISO = (unixTimeMs: number): string => new Date(unixTimeMs).toISOString();
