import type { TimelineEntry } from "../reader.js";
import type { ServiceView, ViewResult } from "./types.js";
import type { ImageMeta } from "../../common/types.js";
import { safeUrl } from "./safe-url.js";
import { formatTime } from "./format.js";

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
    return `<img src="${url}" loading="lazy" alt="" class="entry-image"${widthAttr}${heightAttr}>`;
};

const MicroblogEntryView = ({ entry }: { entry: TimelineEntry }): string => {
    const time = formatTime(entry.unixTimeMs);
    const text = (entry as { text?: string }).text ?? "";
    const images = resolveImages(entry).filter((img) => safeUrl(img.url) !== null);
    const postUrl = entry.url ? safeUrl(entry.url) : null;

    return (
        <article class="timeline-entry timeline-entry--microblog">
            <time class="entry-time">{time}</time>
            <span class="entry-badge">Microblog</span>
            <div class="entry-body">{text}</div>
            {images.length > 0
                ? <div class="entry-images" dangerouslySetInnerHTML={{ __html: images.map(renderImage).join("") }}>
                  </div>
                : ""}
            {postUrl ? <div class="entry-link"><a href={postUrl} target="_blank" rel="noopener noreferrer">View post</a></div> : ""}
        </article>
    );
};

export const microblogView: ServiceView = {
    render(records: TimelineEntry[]): ViewResult[] {
        return records.map((entry) => ({
            html: MicroblogEntryView({ entry }),
        }));
    },
};
