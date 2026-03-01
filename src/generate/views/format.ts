export const formatTime = (unixTimeMs: number): string => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    return formatter.format(new Date(unixTimeMs));
};

export const formatTimeRange = (startMs: number, endMs: number): string => {
    return `${formatTime(startMs)} - ${formatTime(endMs)}`;
};

export const toISO = (unixTimeMs: number): string => new Date(unixTimeMs).toISOString();
