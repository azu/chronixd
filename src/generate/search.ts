import * as pagefind from "pagefind";

export const runPagefind = async (outputDir: string, language: string): Promise<void> => {
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
};
