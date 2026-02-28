import type { TimelineEntry } from "../reader.js";
import type { SlackAttachment } from "../../common/types.js";
import type { ServiceView, ViewResult } from "./types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime } from "./format.js";
import { getServiceIcon } from "./icons.js";

const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Convert Slack mrkdwn links to HTML
// <https://url> → <a href="url">url</a>
// <https://url|label> → <a href="url">label</a>
// Parse mrkdwn links first (on raw text), then escape the remaining text parts
const mrkdwnToHtml = (text: string): string => {
    // Split on Slack link syntax: <url> or <url|label>
    const parts = text.split(/(<https?:\/\/[^>]+>)/g);
    return parts.map((part) => {
        const m = part.match(/^<(https?:\/\/[^|>]+)(?:\|([^>]+))?>$/);
        if (m) {
            const url = m[1];
            const label = m[2] ?? url;
            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
        }
        return escapeHtml(part);
    }).join("");
};

const renderAttachment = (att: SlackAttachment): string => {
    const url = att.titleLink ? safeUrl(att.titleLink) : (att.fromUrl ? safeUrl(att.fromUrl) : null);
    const title = att.title ?? att.serviceName ?? "";
    if (!title && !url) return "";
    if (url) {
        return `<div class="entry-attachment"><a href="${url}" target="_blank" rel="noopener noreferrer">${title || url}</a></div>`;
    }
    return `<div class="entry-attachment">${title}</div>`;
};

const SlackEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const channel = (entry as { channel?: string }).channel ?? "";
    const rawText = (entry as { text?: string }).text ?? "";
    const textHtml = mrkdwnToHtml(rawText);
    const permalink = entry.url ? safeUrl(entry.url) : ((entry as { permalink?: string }).permalink ? safeUrl((entry as { permalink?: string }).permalink!) : null);
    const attachments = ((entry as { attachments?: SlackAttachment[] }).attachments ?? []).filter((a) => a.title || a.titleLink || a.fromUrl);

    return (
        <article class="timeline-entry timeline-entry--slack">
            <time class="entry-time">{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("slack")} Slack` }}></span>
            <span class="entry-meta">#{channel}</span>
            <div class="entry-body" dangerouslySetInnerHTML={{ __html: textHtml }}></div>
            {attachments.length > 0
                ? <div class="entry-attachments" dangerouslySetInnerHTML={{ __html: attachments.map(renderAttachment).join("") }}></div>
                : ""}
            {permalink ? <div class="entry-link"><a href={permalink} target="_blank" rel="noopener noreferrer">View message</a></div> : ""}
        </article>
    );
};

export const slackView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: SlackEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
