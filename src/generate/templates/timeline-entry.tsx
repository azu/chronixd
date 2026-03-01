import type { TimelineEntry } from "../reader.js";
import { getView } from "../views/index.js";
import { formatTime } from "../views/format.js";

export const renderTimelineEntries = (entries: TimelineEntry[]): string => {
    // Group entries by service
    const byService = new Map<string, TimelineEntry[]>();
    for (const entry of entries) {
        const key = entry.service;
        const existing = byService.get(key);
        if (existing) {
            existing.push(entry);
        } else {
            byService.set(key, [entry]);
        }
    }

    // Render each service group, then interleave by time
    const rendered: { html: string; unixTimeMs: number }[] = [];

    for (const [serviceDir, serviceEntries] of byService) {
        const view = getView(serviceDir);
        const results = view.render(serviceEntries);

        for (const result of results) {
            rendered.push({
                html: result.html,
                unixTimeMs: result.unixTimeMs,
            });
        }
    }

    // Sort by time descending
    rendered.sort((a, b) => b.unixTimeMs - a.unixTimeMs);

    // Add id + hidden h3 to each entry for Pagefind sub-result anchor links
    let counter = 0;
    return rendered.map((r) => {
        const id = `e-${r.unixTimeMs}-${counter++}`;
        const heading = `<h3 id="${id}" class="sr-only">${formatTime(r.unixTimeMs)}</h3>`;
        return r.html.replace("<article ", `<article aria-labelledby="${id}" `) + heading;
    }).join("\n");
};
