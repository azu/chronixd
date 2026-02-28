import type { TimelineEntry } from "../reader.js";

export type ViewResult = {
    html: string;
    unixTimeMs: number;
};

export type ServiceView = {
    render(records: TimelineEntry[]): ViewResult[];
};
