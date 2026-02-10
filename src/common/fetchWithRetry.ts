import { info } from "./logger.js";

type FetchWithRetryOptions = {
    maxRetries?: number;
    baseDelayMs?: number;
};

const getDefaultMaxRetries = (): number => {
    const envValue = process.env.CHRONIXD_RETRY_COUNT;
    if (envValue !== undefined) {
        const parsed = parseInt(envValue, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) {
            return parsed;
        }
    }
    return 2;
};

const parseRetryAfter = (header: string | null): number | null => {
    if (header === null) {
        return null;
    }
    // Try parsing as seconds (e.g. "120")
    const seconds = parseInt(header, 10);
    if (!Number.isNaN(seconds) && seconds >= 0) {
        return seconds * 1000;
    }
    // Try parsing as HTTP-date (RFC 7231 Section 7.1.3)
    const date = new Date(header);
    if (!Number.isNaN(date.getTime())) {
        const delayMs = date.getTime() - Date.now();
        return Math.max(0, delayMs);
    }
    return null;
};

const isRetryableStatus = (status: number): boolean => {
    return status === 429 || status >= 500;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchWithRetry = async (
    input: string | URL | Request,
    init?: RequestInit,
    options?: FetchWithRetryOptions,
): Promise<Response> => {
    const maxRetries = options?.maxRetries ?? getDefaultMaxRetries();
    const baseDelayMs = options?.baseDelayMs ?? 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(input, init);
            if (!isRetryableStatus(response.status) || attempt === maxRetries) {
                return response;
            }
            // Retryable HTTP status
            const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
            const delayMs = retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
            info("fetchWithRetry: %d status, retry %d/%d after %dms", response.status, attempt + 1, maxRetries, delayMs);
            await sleep(delayMs);
        } catch (error) {
            // Network errors (TypeError: fetch failed, etc.)
            if (attempt === maxRetries) {
                throw error;
            }
            const delayMs = baseDelayMs * Math.pow(2, attempt);
            info("fetchWithRetry: network error, retry %d/%d after %dms: %s", attempt + 1, maxRetries, delayMs, (error as Error).message);
            await sleep(delayMs);
        }
    }
    // unreachable
    throw new Error("fetchWithRetry: unexpected state");
};
