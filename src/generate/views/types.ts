import type { TimelineEntry } from "../reader.js";

export type ViewResult = {
    html: string;
};

export type ServiceView = {
    render(records: TimelineEntry[]): ViewResult[];
};
