const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Auto-link plain URLs in text (escape HTML for non-URL parts)
// Matches https://..., http://..., and www....
export const autolinkUrls = (text: string): string => {
    const parts = text.split(/((?:https?:\/\/|www\.)\S+)/g);
    return parts.map((part) => {
        if (/^(?:https?:\/\/|www\.)/.test(part)) {
            // Strip trailing punctuation that's likely not part of the URL
            const m = part.match(/^((?:https?:\/\/|www\.)[^\s"'<>]+?)([.,:;!?)]+)?$/);
            const rawUrl = m ? m[1] : part;
            const trail = m ? escapeHtml(m[2] ?? "") : "";
            const href = rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl;
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a>${trail}`;
        }
        return escapeHtml(part);
    }).join("");
};
