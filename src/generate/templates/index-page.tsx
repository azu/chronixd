import type { DayGroup } from "../reader.js";
import { Layout } from "./layout.js";

type IndexPageProps = {
    dayGroups: DayGroup[];
    language: string;
};

const dateKeyToPath = (dateKey: string): string => {
    const [year, month, day] = dateKey.split("-");
    return `${year}/${month}/${day}.html`;
};

export const IndexPage = ({ dayGroups, language }: IndexPageProps): string => {
    const title = "chronixd";

    // Group days by year-month for calendar-like display
    const byMonth = new Map<string, DayGroup[]>();
    for (const group of dayGroups) {
        const monthKey = `${group.year}-${String(group.month).padStart(2, "0")}`;
        const existing = byMonth.get(monthKey);
        if (existing) {
            existing.push(group);
        } else {
            byMonth.set(monthKey, [group]);
        }
    }

    const monthSections = [...byMonth.entries()].map(([monthKey, groups]) => {
        const dayLinks = groups.map((g) => (
            <li>
                <a href={dateKeyToPath(g.dateKey)}>
                    {g.dateKey}
                </a>
                <span class="day-count">{g.entries.length} entries</span>
            </li>
        )).join("\n");

        return (
            <section class="month-section">
                <h2>{monthKey}</h2>
                <ul class="day-list" dangerouslySetInnerHTML={{ __html: dayLinks }}>
                </ul>
            </section>
        );
    }).join("\n");

    const content = `<h1>Timeline</h1>` + monthSections;

    return "<!DOCTYPE html>\n" + Layout({ title, language, children: content });
};
