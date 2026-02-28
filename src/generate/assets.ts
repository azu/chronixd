import * as fs from "fs/promises";
import * as path from "path";

// Embed asset files at compile time using Bun's file import.
// This ensures assets are bundled into the compiled binary.
import styleCSS from "./assets/style.css" with { type: "text" };
import postClientJS from "./assets/post-client.js" with { type: "text" };
import locationMapJS from "./assets/location-map.js" with { type: "text" };

const ASSETS: Record<string, string> = {
    "style.css": styleCSS,
    "post-client.js": postClientJS,
    "location-map.js": locationMapJS,
};

export const copyAssets = async (outputDir: string): Promise<void> => {
    const destDir = path.join(outputDir, "assets");
    await fs.mkdir(destDir, { recursive: true });

    for (const [filename, content] of Object.entries(ASSETS)) {
        await fs.writeFile(path.join(destDir, filename), content, "utf-8");
    }
};
