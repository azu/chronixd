import * as fs from "fs/promises";
import * as path from "path";

const ASSETS_SOURCE_DIR = path.join(import.meta.dirname, "assets");

export const copyAssets = async (outputDir: string): Promise<void> => {
    const destDir = path.join(outputDir, "assets");
    await fs.mkdir(destDir, { recursive: true });

    const files = await fs.readdir(ASSETS_SOURCE_DIR);
    for (const file of files) {
        await fs.copyFile(
            path.join(ASSETS_SOURCE_DIR, file),
            path.join(destDir, file)
        );
    }
};
