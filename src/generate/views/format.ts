const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
    const key = `${locale}:${JSON.stringify(options)}`;
    const cached = formatterCache.get(key);
    if (cached) return cached;
    const formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);
    return formatter;
};

export const formatTime = (unixTimeMs: number): string => {
    const formatter = getFormatter("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
    });
    return formatter.format(new Date(unixTimeMs));
};

export const formatTimeRange = (startMs: number, endMs: number): string => {
    return `${formatTime(startMs)} - ${formatTime(endMs)}`;
};
