export const runPagefind = async (outputDir: string, language: string): Promise<void> => {
    try {
        const pagefind = await import("pagefind");
        const { index } = await pagefind.createIndex({
            forceLanguage: language,
        });
        if (!index) {
            throw new Error("Pagefind: failed to create index");
        }
        const { errors, page_count } = await index.addDirectory({
            path: outputDir,
        });
        if (errors.length > 0) {
            throw new Error(`Pagefind addDirectory failed: ${errors.join(", ")}`);
        }
        const writeResult = await index.writeFiles({
            outputPath: `${outputDir}/pagefind`,
        });
        if (writeResult.errors.length > 0) {
            throw new Error(`Pagefind writeFiles failed: ${writeResult.errors.join(", ")}`);
        }
        await pagefind.close();
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("pagefind") || message.includes("not yet a supported")) {
            // pagefind binary not available (e.g. compiled binary without node_modules)
            // Skip search indexing silently
            return;
        }
        throw e;
    }
};
