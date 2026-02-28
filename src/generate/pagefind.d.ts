declare module "pagefind" {
    type CreateIndexOptions = {
        rootSelector?: string;
        excludeSelectors?: string[];
        forceLanguage?: string;
        keepIndexUrl?: boolean;
        verbose?: boolean;
    };

    type PagefindIndex = {
        addDirectory(options: { path: string; glob?: string }): Promise<{ errors: string[]; page_count: number }>;
        addCustomRecord(options: { url: string; content: string; language: string; meta?: Record<string, string> }): Promise<{ errors: string[] }>;
        writeFiles(options: { outputPath: string }): Promise<{ errors: string[] }>;
    };

    export function createIndex(options?: CreateIndexOptions): Promise<{ index: PagefindIndex | null; errors: string[] }>;
    export function close(): Promise<void>;
}
