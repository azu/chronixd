import { execFile } from "child_process";

const findPagefind = async (): Promise<string | null> => {
    // Check if pagefind or pagefind_extended is available in PATH
    for (const name of ["pagefind_extended", "pagefind"]) {
        try {
            const proc = Bun.spawn(["which", name], { stdout: "pipe", stderr: "ignore" });
            await proc.exited;
            if (proc.exitCode === 0) {
                const path = await new Response(proc.stdout).text();
                return path.trim();
            }
        } catch {
            // not found, continue
        }
    }
    return null;
};

const runPagefindCli = (bin: string, args: string[]): Promise<void> => {
    return new Promise((resolve, reject) => {
        execFile(bin, args, (error, _stdout, stderr) => {
            if (error) {
                reject(new Error(`pagefind failed: ${stderr || error.message}`));
                return;
            }
            resolve();
        });
    });
};

export const runPagefind = async (outputDir: string, language: string): Promise<void> => {
    // Try Node API first (works in dev with node_modules)
    try {
        const pagefind = await import("pagefind");
        const { index } = await pagefind.createIndex({
            forceLanguage: language,
        });
        if (!index) {
            throw new Error("Pagefind: failed to create index");
        }
        const { errors } = await index.addDirectory({ path: outputDir });
        if (errors.length > 0) {
            throw new Error(`Pagefind addDirectory failed: ${errors.join(", ")}`);
        }
        const writeResult = await index.writeFiles({ outputPath: `${outputDir}/pagefind` });
        if (writeResult.errors.length > 0) {
            throw new Error(`Pagefind writeFiles failed: ${writeResult.errors.join(", ")}`);
        }
        await pagefind.close();
        return;
    } catch {
        // Node API not available, try CLI fallback
    }

    // Fallback: run pagefind CLI as subprocess
    const bin = await findPagefind();
    if (!bin) {
        // pagefind not available at all, skip search indexing
        return;
    }

    await runPagefindCli(bin, [
        "--site", outputDir,
        "--output-path", `${outputDir}/pagefind`,
        "--force-language", language,
    ]);
};
