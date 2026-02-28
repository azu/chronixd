import * as fs from "fs/promises";
import * as path from "path";
import type { DayGroup } from "./reader.js";
import { DayPage } from "./templates/day-page.js";
import { IndexPage } from "./templates/index-page.js";
import { PostPage } from "./templates/post-page.js";

type GenerateOptions = {
    language: string;
    microblogEndpoint: string | null;
    microblogToken: string | null;
};

const getTodayDateKey = (): string => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

const filterFutureDays = (dayGroups: DayGroup[]): DayGroup[] => {
    const today = getTodayDateKey();
    return dayGroups.filter((g) => g.dateKey <= today);
};

export const generateDayPages = async (
    outputDir: string,
    dayGroups: DayGroup[],
    options: GenerateOptions
): Promise<void> => {
    const filtered = filterFutureDays(dayGroups);
    for (let i = 0; i < filtered.length; i++) {
        const dayGroup = filtered[i];
        const prevDateKey = i > 0 ? filtered[i - 1].dateKey : null;
        const nextDateKey = i < filtered.length - 1 ? filtered[i + 1].dateKey : null;

        const html = DayPage({
            dayGroup,
            prevDateKey,
            nextDateKey,
            language: options.language,
            microblogEndpoint: options.microblogEndpoint,
            microblogToken: options.microblogToken,
        });

        const [year, month, day] = dayGroup.dateKey.split("-");
        const dir = path.join(outputDir, year, month);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${day}.html`), html, "utf-8");
    }
};

export const generateIndexPage = async (
    outputDir: string,
    dayGroups: DayGroup[],
    options: GenerateOptions
): Promise<void> => {
    const filtered = filterFutureDays(dayGroups);
    const html = IndexPage({
        dayGroups: filtered,
        language: options.language,
    });

    await fs.writeFile(path.join(outputDir, "index.html"), html, "utf-8");

    // Copy today's page to today.html at root
    const today = getTodayDateKey();
    const todayGroup = filtered.find((g) => g.dateKey === today);
    if (todayGroup) {
        const [y, m, d] = today.split("-");
        const todayFile = path.join(outputDir, y, m, `${d}.html`);
        await fs.copyFile(todayFile, path.join(outputDir, "today.html"));
    }

    // Generate post page if microblog is configured
    if (options.microblogEndpoint && options.microblogToken) {
        const postHtml = PostPage({
            language: options.language,
            microblogEndpoint: options.microblogEndpoint,
            microblogToken: options.microblogToken,
        });
        await fs.writeFile(path.join(outputDir, "post.html"), postHtml, "utf-8");
    }
};
