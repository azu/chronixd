import ical, { VEvent } from "node-ical"
import { CalendarRecord, BaseRecord } from "../common/types.js";
import { createCache } from "../common/cache.js";

export type CalendarEnv = {
    calendar_url: string;
};
export const CalendarType = "calendar" as const;
const FETCH_DAYS = 28;
export const isCalendarEnv = (env: unknown): env is CalendarEnv => {
    return typeof (env as CalendarEnv).calendar_url === "string";
}
const isBetween = (targetDate: Date, start: Date, days: number) => {
    if (targetDate.getTime() < start.getTime()) return false;
    const endDate = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    return start <= targetDate && targetDate <= endDate;
}
const cacheFileName = "calendar.json" as const;
type CacheItem = {
    id: string;
    unixTimeMs: number;
}
const updateCacheEvents = ({
                               oldEvents,
                               newEvents,
                               today = new Date()
                           }: { oldEvents: CacheItem[], newEvents: { uid: string; unixTimeMs: number }[], today?: Date }) => {
    const newCache = oldEvents.concat(newEvents.map(item => {
        return {
            unixTimeMs: item.unixTimeMs,
            id: item.uid,
        }
    }));
    const CacheLimitDate = new Date(today.getTime() - (24 * 60 * 60 * 1000) * FETCH_DAYS);
    return newCache.filter(item => {
        return item.unixTimeMs >= CacheLimitDate.getTime();
    });
}
const hashEvent = (event: VEvent) => {
    return Bun.hash(event.summary + "@@@" + event.start.getTime().toString()).toString();
}
export const fetchCalendar = async (env: CalendarEnv, _lastRecord: BaseRecord | null): Promise<CalendarRecord[]> => {
    const res = await fetch(env.calendar_url).then(res => {
        if (res.ok) {
            return res.text();
        }
        throw new Error("Calendar fetch failed");
    });
    const ics = await ical.parseICS(res);
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
    const events = Object.values(ics)
        .filter((event) => {
            if (event.type !== "VEVENT") {
                return false;
            }
            return isBetween(event.start, startOfToday, FETCH_DAYS);
        })
        .map(event => {
            if (event.type !== "VEVENT") {
                throw new Error("Event type is not VEVENT");
            }
            return {
                uid: hashEvent(event),
                summary: event.summary,
                url: event.url,
                unixTimeMs: event.start.getTime(),
            }
        });
    const cache = createCache<CacheItem>(cacheFileName);
    const cachedEvents = await cache.read();
    const newEvents = events.filter(event => {
        return !cachedEvents.some(item => item.id === event.uid)
    });
    const newCache = updateCacheEvents({
        oldEvents: cachedEvents,
        newEvents: newEvents,
        today: startOfToday
    });
    await cache.write(newCache);
    return newEvents.map(item => {
        return {
            type: CalendarType,
            summary: item.summary,
            url: item.url,
            unixTimeMs: item.unixTimeMs,
        };
    });
}
