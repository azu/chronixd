import ical, { VEvent } from "node-ical"
import { CalendarRecord, BaseRecord, ServiceDefinition } from "../common/types.js";
import { fetchWithRetry } from "../common/fetchWithRetry.js";

export type CalendarEnv = {
    calendar_url: string;
};
export const CalendarType = "Calendar" as const;
export const CALENDAR_FETCH_DAYS = 28;
export const isCalendarEnv = (env: unknown): env is CalendarEnv => {
    return typeof (env as CalendarEnv).calendar_url === "string";
}
const isBetween = (targetDate: Date, start: Date, days: number) => {
    if (targetDate.getTime() < start.getTime()) return false;
    const endDate = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    return start <= targetDate && targetDate <= endDate;
}
const fetchCalendar = async (env: CalendarEnv, _lastRecord: BaseRecord | null): Promise<{
    records: CalendarRecord[];
    replaceFilter: { type: string; sinceUnixTimeMs: number };
}> => {
    const res = await fetchWithRetry(env.calendar_url).then(res => {
        if (res.ok) {
            return res.text();
        }
        throw new Error("Calendar fetch failed");
    });
    const ics = await ical.parseICS(res);
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const records = Object.values(ics)
        .filter((event) => {
            if (event.type !== "VEVENT") {
                return false;
            }
            return isBetween(event.start, startOfToday, CALENDAR_FETCH_DAYS);
        })
        .map(event => {
            if (event.type !== "VEVENT") {
                throw new Error("Event type is not VEVENT");
            }
            return {
                type: CalendarType,
                summary: event.summary,
                url: event.url,
                unixTimeMs: event.start.getTime(),
                endUnixTimeMs: event.end ? event.end.getTime() : undefined,
            } satisfies CalendarRecord;
        });
    return {
        records,
        replaceFilter: { type: CalendarType, sinceUnixTimeMs: startOfToday.getTime() },
    };
};

export const calendarService: ServiceDefinition = {
    writeMode: "replace",
    isEnv: isCalendarEnv,
    fetch: (env, lastRecord) => fetchCalendar(env, lastRecord),
};
