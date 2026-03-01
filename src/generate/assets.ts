import * as fs from "fs/promises";
import * as path from "path";

// Embed asset files at compile time using Bun's file import.
// This ensures assets are bundled into the compiled binary.
import styleCSS from "./assets/style.css" with { type: "text" };
import postClientJS from "./assets/post-client.js" with { type: "text" };
import locationMapJS from "./assets/location-map.js" with { type: "text" };
import faviconSVG from "./assets/favicon.svg" with { type: "text" };
import { faviconPng180, faviconPng32, faviconPng16 } from "./assets/favicon-data.js";

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

    // Favicons go in the root, not assets/
    await fs.writeFile(path.join(outputDir, "favicon.svg"), faviconSVG, "utf-8");
    await fs.writeFile(path.join(outputDir, "apple-touch-icon.png"), Buffer.from(faviconPng180, "base64"));
    await fs.writeFile(path.join(outputDir, "favicon-32x32.png"), Buffer.from(faviconPng32, "base64"));
    await fs.writeFile(path.join(outputDir, "favicon-16x16.png"), Buffer.from(faviconPng16, "base64"));
};
