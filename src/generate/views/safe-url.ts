export const isSafeUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
};

export const safeUrl = (url: string): string | null => {
    return isSafeUrl(url) ? url : null;
};
