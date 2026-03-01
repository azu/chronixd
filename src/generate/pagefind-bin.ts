import { writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const getEmbeddedBinaryPath = (): string | null => {
    if (process.platform === "darwin" && process.arch === "arm64") {
        return require("@pagefind/darwin-arm64/bin/pagefind_extended");
    }
    if (process.platform === "darwin" && process.arch === "x64") {
        return require("@pagefind/darwin-x64/bin/pagefind_extended");
    }
    if (process.platform === "linux" && process.arch === "arm64") {
        return require("@pagefind/linux-arm64/bin/pagefind_extended");
    }
    if (process.platform === "linux" && process.arch === "x64") {
        return require("@pagefind/linux-x64/bin/pagefind_extended");
    }
    return null;
};

let extractedPath: string | null = null;

export const getEmbeddedPagefind = async (): Promise<string> => {
    if (extractedPath && existsSync(extractedPath)) return extractedPath;
    const embeddedPath = getEmbeddedBinaryPath();
    if (!embeddedPath) {
        throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`);
    }
    const tmp = join(tmpdir(), `pagefind_extended_${process.pid}`);
    const content = await Bun.file(embeddedPath).arrayBuffer();
    writeFileSync(tmp, Buffer.from(content));
    chmodSync(tmp, 0o755);
    extractedPath = tmp;
    return tmp;
};
