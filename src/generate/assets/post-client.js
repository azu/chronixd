// chronixd post client — handles microblog posting and API-based timeline updates

const microblogIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';

const getConfig = () => {
    const form = document.querySelector(".post-form");
    if (form) {
        return {
            endpoint: form.dataset.endpoint || "",
            token: form.dataset.token || "",
        };
    }
    return {
        endpoint: document.body.dataset.microblogEndpoint || "",
        token: document.body.dataset.microblogToken || "",
    };
};

const setStatus = (msg, type = "") => {
    const el = document.getElementById("post-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "post-status" + (type ? ` post-status--${type}` : "");
};

const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
};

const uploadImage = async (endpoint, token, file) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${endpoint}/api/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
};

const submitPost = async (endpoint, token, text, images) => {
    const res = await fetch(`${endpoint}/api/posts`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, images }),
    });

    if (!res.ok) throw new Error(`Post failed: ${res.status}`);
    return res.json();
};

const isTodayPage = () => {
    const p = location.pathname;
    if (p.endsWith("/today.html") || p.endsWith("/today")) return true;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return p.endsWith(`/${y}/${m}/${d}.html`) || p.endsWith(`/${y}/${m}/${d}`);
};

const createMicroblogEntry = (post) => {
    const el = document.createElement("article");
    el.className = "timeline-entry timeline-entry--microblog";

    const dt = new Date(post.unixTimeMs);
    const time = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(dt);
    const iso = dt.toISOString();

    const imagesHtml = (post.images || [])
        .map((img) => {
            const w = img.width ? ` width="${img.width}"` : "";
            const h = img.height ? ` height="${img.height}"` : "";
            return `<img data-auth-src="${escapeHtml(img.url)}" class="entry-image" loading="lazy" alt=""${w}${h}>`;
        })
        .join("");

    el.innerHTML = `
        <time class="entry-time" datetime="${iso}">${time}</time>
        <span class="entry-badge">${microblogIcon} Microblog</span>
        <div class="entry-body">${escapeHtml(post.text)}</div>
        ${imagesHtml ? `<div class="entry-images">${imagesHtml}</div>` : ""}
    `;

    return el;
};

const loadAuthImages = (container) => {
    const { token } = getConfig();
    if (!token) return;
    for (const img of container.querySelectorAll("img[data-auth-src]")) {
        fetch(img.dataset.authSrc, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => { if (!r.ok) throw r; return r.blob(); })
            .then((b) => { img.src = URL.createObjectURL(b); })
            .catch(() => {});
    }
};

const formatEntryTimes = (container) => {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const now = Date.now();
    const DAY = 864e5;
    let rtf;
    try { rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }); } catch (_e) { /* ignore */ }

    for (const el of container.querySelectorAll("time.entry-time[datetime]")) {
        const dt = new Date(el.getAttribute("datetime"));
        if (Number.isNaN(dt.getTime())) continue;
        const diff = now - dt.getTime();
        if (rtf && diff >= 0 && diff < DAY) {
            const m = Math.floor(diff / 6e4);
            const h = Math.floor(diff / 36e5);
            el.textContent = m < 1 ? rtf.format(0, "minute") : h < 1 ? rtf.format(-m, "minute") : rtf.format(-h, "hour");
        } else {
            el.textContent = fmt.format(dt);
        }
    }
};

const fetchAndRenderApiPosts = async () => {
    if (!isTodayPage()) return;
    const { endpoint, token } = getConfig();
    if (!endpoint || !token) return;

    const buildTime = document.body.dataset.buildTime;
    const sinceMs = buildTime ? new Date(buildTime).getTime() : 0;

    let res;
    try {
        res = await fetch(`${endpoint}/api/posts.ndjson?since=${sinceMs}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (cause) {
        console.error(new Error("[chronixd] Failed to fetch microblog posts", { cause }));
        return;
    }
    if (!res.ok) {
        console.error(new Error(`[chronixd] Microblog API returned ${res.status}`, { cause: res }));
        return;
    }

    const body = await res.text();
    if (!body.trim()) return;

    const posts = body.trimEnd().split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));

    // Filter: only today's posts that are newer than build time
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 864e5;
    const newPosts = posts.filter((p) => p.unixTimeMs >= todayStart && p.unixTimeMs < todayEnd && p.unixTimeMs > sinceMs);

    if (newPosts.length === 0) return;

    // Sort newest first
    newPosts.sort((a, b) => b.unixTimeMs - a.unixTimeMs);

    const timeline = document.querySelector(".timeline");
    if (!timeline) return;

    // Remove previously inserted API entries before re-rendering
    for (const el of timeline.querySelectorAll(".timeline-entry--api")) {
        el.remove();
    }

    const fragment = document.createDocumentFragment();
    for (const post of newPosts) {
        const el = createMicroblogEntry(post);
        el.classList.add("timeline-entry--api");
        fragment.appendChild(el);
    }

    // Prepend to timeline (newest API posts above existing static entries)
    timeline.insertBefore(fragment, timeline.firstChild);

    // Process dynamically added entries
    loadAuthImages(timeline);
    formatEntryTimes(timeline);
};

const initPostForm = () => {
    const form = document.getElementById("post-form");
    const postFormSection = document.querySelector(".post-form");
    if (!form || !postFormSection) return;

    const { endpoint, token } = getConfig();
    if (!endpoint) return;

    const textEl = document.getElementById("post-text");
    if (textEl) {
        textEl.addEventListener("keydown", (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                form.requestSubmit();
            }
        });
    }

    const fileInput = document.getElementById("post-images");
    const preview = document.getElementById("post-image-preview");

    if (fileInput && preview) {
        fileInput.addEventListener("change", () => {
            preview.innerHTML = "";
            for (const file of fileInput.files) {
                const img = document.createElement("img");
                img.src = URL.createObjectURL(file);
                preview.appendChild(img);
            }
        });
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const textEl = document.getElementById("post-text");
        const text = textEl.value.trim();
        if (!text) return;

        const submitBtn = form.querySelector(".post-form-submit");
        submitBtn.disabled = true;
        setStatus("Posting...");

        try {
            const images = [];
            if (fileInput && fileInput.files.length > 0) {
                for (const file of fileInput.files) {
                    const imageMeta = await uploadImage(endpoint, token, file);
                    images.push(imageMeta);
                }
            }

            await submitPost(endpoint, token, text, images);
            setStatus("Posted!", "success");

            textEl.value = "";
            if (fileInput) fileInput.value = "";
            if (preview) preview.innerHTML = "";

            // Close post page after successful post
            if (location.pathname.endsWith("/post.html")) {
                setTimeout(() => { if (history.length > 1) history.back(); else location.href = "today.html"; }, 500);
                return;
            }

            // Re-fetch from API to show the new post in timeline
            await fetchAndRenderApiPosts();
        } catch (err) {
            setStatus(`Failed: ${err.message}`, "error");
        } finally {
            submitBtn.disabled = false;
        }
    });
};

const initLightbox = () => {
    document.addEventListener("click", (e) => {
        const img = e.target.closest(".entry-image[src]");
        if (!img) return;
        e.preventDefault();
        const overlay = document.createElement("div");
        overlay.className = "lightbox-overlay";
        const full = document.createElement("img");
        full.src = img.src;
        overlay.appendChild(full);
        overlay.addEventListener("click", () => overlay.remove());
        document.body.appendChild(overlay);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const overlay = document.querySelector(".lightbox-overlay");
            if (overlay) overlay.remove();
        }
    });
};

// Init
document.addEventListener("DOMContentLoaded", async () => {
    initPostForm();
    await fetchAndRenderApiPosts();
    initLightbox();
});

// Re-fetch when navigating back (bfcache restore)
window.addEventListener("pageshow", async (e) => {
    if (e.persisted) {
        await fetchAndRenderApiPosts();
    }
});
