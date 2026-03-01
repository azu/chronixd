import type { DayGroup } from "../reader.js";
import { Layout } from "./layout.js";
import { renderTimelineEntries } from "./timeline-entry.js";

type DayPageProps = {
    dayGroup: DayGroup;
    prevDateKey: string | null;
    nextDateKey: string | null;
    language: string;
    microblogEndpoint: string | null;
    microblogToken: string | null;
    pathPrefix?: string;
};

const dateKeyToPath = (dateKey: string): string => {
    const [year, month, day] = dateKey.split("-");
    return `${year}/${month}/${day}.html`;
};

const NavBar = ({ prevDateKey, nextDateKey, pathPrefix }: { prevDateKey: string | null; nextDateKey: string | null; pathPrefix: string }): string => {
    return (
        <nav class="day-nav">
            {nextDateKey
                ? <a href={`${pathPrefix}${dateKeyToPath(nextDateKey)}`} class="day-nav-prev">{nextDateKey}</a>
                : <span class="day-nav-prev day-nav-disabled">older</span>}
            <a href={`${pathPrefix}index.html`} class="day-nav-home">Home</a>
            {prevDateKey
                ? <a href={`${pathPrefix}${dateKeyToPath(prevDateKey)}`} class="day-nav-next">{prevDateKey}</a>
                : <span class="day-nav-next day-nav-disabled">newer</span>}
        </nav>
    );
};

export const DayPage = ({ dayGroup, prevDateKey, nextDateKey, language, microblogEndpoint, microblogToken, pathPrefix: pathPrefixOverride }: DayPageProps): string => {
    const { dateKey, entries } = dayGroup;
    const pathPrefix = pathPrefixOverride ?? "../../";
    const title = `${dateKey} - chronixd`;

    const nav = NavBar({ prevDateKey, nextDateKey, pathPrefix });
    const timeline = renderTimelineEntries(entries);
    const hasMicroblog = !!(microblogEndpoint && microblogToken);

    const content = `<h1 data-pagefind-sort="date[datetime]" datetime="${dateKey}">${dateKey}</h1>`
        + nav
        + `<section class="timeline">${timeline}</section>`
        + nav;

    return "<!DOCTYPE html>\n" + Layout({ title, language, children: content, pathPrefix, microblogToken, hasMicroblog });
};
