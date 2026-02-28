import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import type { ImageMeta } from "../../common/types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime } from "./format.js";
import { getServiceIcon } from "./icons.js";

const resolveImages = (entry: TimelineEntry): ImageMeta[] => {
    const images = (entry as { images?: ImageMeta[] }).images;
    if (images && images.length > 0) return images;
    // backward compat: old records with imageUrls
    const imageUrls = (entry as { imageUrls?: string[] }).imageUrls;
    if (imageUrls && imageUrls.length > 0) return imageUrls.map((url) => ({ url }));
    return [];
};

const renderImage = (img: ImageMeta): string => {
    const url = safeUrl(img.url);
    if (!url) return "";
    const widthAttr = img.width ? ` width="${img.width}"` : "";
    const heightAttr = img.height ? ` height="${img.height}"` : "";
    return `<img data-auth-src="${url}" loading="lazy" alt="" class="entry-image"${widthAttr}${heightAttr}>`;
};

const MicroblogEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const text = (entry as { text?: string }).text ?? "";
    const images = resolveImages(entry).filter((img) => safeUrl(img.url) !== null);
    const postUrl = entry.url ? safeUrl(entry.url) : null;

    return (
        <article class="timeline-entry timeline-entry--microblog">
            <time class="entry-time">{time}</time>
            <span class="entry-badge" dangerouslySetInnerHTML={{ __html: `${getServiceIcon("microblog")} Microblog` }}></span>
            <div class="entry-body">{text}</div>
            {images.length > 0
                ? <div class="entry-images" dangerouslySetInnerHTML={{ __html: images.map(renderImage).join("") }}>
                  </div>
                : ""}
        </article>
    );
};

export const microblogView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: MicroblogEntryView({ entry }),
            unixTimeMs: entry.unixTimeMs,
        }));
    },
};
