import type { TimelineEntry } from "../reader.js";
import { getView } from "../views/index.js";

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

        // For 1-to-1 views, pair results with entries' timestamps
        if (results.length === serviceEntries.length) {
            for (let i = 0; i < results.length; i++) {
                rendered.push({
                    html: results[i].html,
                    unixTimeMs: serviceEntries[i].unixTimeMs,
                });
            }
        } else {
            // For N-to-1 views (like location), use the first entry's timestamp
            for (const result of results) {
                rendered.push({
                    html: result.html,
                    unixTimeMs: serviceEntries[0].unixTimeMs,
                });
            }
        }
    }

    // Sort by time descending
    rendered.sort((a, b) => b.unixTimeMs - a.unixTimeMs);

    return rendered.map((r) => r.html).join("\n");
};
