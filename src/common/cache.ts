import * as fs from "fs/promises";
import * as path from "path";
import { debug } from "./logger.js";

const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), "./cache");
/**
 * Create cache object
 * store cache in CACHE_DIR
 * @param cacheFileName
 */
export const createCache = <T>(cacheFileName: string, options?: { maxItems?: number; cacheDir?: string }) => {
    const cacheDir = options?.cacheDir ?? CACHE_DIR;
    const trim = (items: T[]): T[] => {
        if (!options?.maxItems || items.length <= options.maxItems) return items;
        return items.slice(-options.maxItems);
    };
    const read = async (): Promise<T[]> => {
        const cachePath = path.join(cacheDir, cacheFileName);
        try {
            const cache = await fs.readFile(cachePath, "utf-8");
            const cachedItems = JSON.parse(cache) as T[];
            debug("read cache", cachedItems);
            return cachedItems;
        } catch (e) {
            return [];
        }
    }
    const write = async (cache: T[]) => {
        // DRY run
        if (process.env.CHRONIXD_DRY_RUN) {
            debug("[DRY RUN] write cache", cache)
            return;
        }
        await fs.mkdir(cacheDir, { recursive: true });
        const cachePath = path.join(cacheDir, cacheFileName);
        const trimmedCache = trim(cache);
        debug("write cache", trimmedCache)
        await fs.writeFile(cachePath, JSON.stringify(trimmedCache), "utf-8");
    }

    const merge = async (cache: T[]) => {
        const oldCache = await read();
        const newCache = [...oldCache, ...cache];
        await write(newCache);
    }
    return {
        read,
        write,
        merge
    }
}
