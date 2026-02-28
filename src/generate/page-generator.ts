import * as fs from "fs/promises";
import * as path from "path";
import type { DayGroup } from "./reader.js";
import { DayPage } from "./templates/day-page.js";
import { IndexPage } from "./templates/index-page.js";

type GenerateOptions = {
    language: string;
    microblogEndpoint: string | null;
};

export const generateDayPages = async (
    outputDir: string,
    dayGroups: DayGroup[],
    options: GenerateOptions
): Promise<void> => {
    for (let i = 0; i < dayGroups.length; i++) {
        const dayGroup = dayGroups[i];
        const prevDateKey = i > 0 ? dayGroups[i - 1].dateKey : null;
        const nextDateKey = i < dayGroups.length - 1 ? dayGroups[i + 1].dateKey : null;

        const html = DayPage({
            dayGroup,
            prevDateKey,
            nextDateKey,
            language: options.language,
            microblogEndpoint: options.microblogEndpoint,
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
    const html = IndexPage({
        dayGroups,
        language: options.language,
    });

    await fs.writeFile(path.join(outputDir, "index.html"), html, "utf-8");
};
