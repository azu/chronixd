// chronixd post client — handles microblog posting, offline queue, local post cache

const DB_NAME = "chronixd-posts";
const DB_VERSION = 2;
const PENDING_STORE = "pending";
const POSTED_STORE = "posted";

const openDB = () => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = req.result;
            if (!db.objectStoreNames.contains(PENDING_STORE)) {
                db.createObjectStore(PENDING_STORE, { keyPath: "id", autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(POSTED_STORE)) {
                db.createObjectStore(POSTED_STORE, { keyPath: "id", autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const dbAdd = async (storeName, item) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).add(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const dbGetAll = async (storeName) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const dbDelete = async (storeName, id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const getToken = () => {
    const form = document.querySelector(".post-form");
    return form ? (form.dataset.token || "") : "";
};

const setStatus = (msg, type = "") => {
    const el = document.getElementById("post-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "post-status" + (type ? ` post-status--${type}` : "");
};

const uploadImage = async (endpoint, file) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${endpoint}/api/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
};

const submitPost = async (endpoint, text, images) => {
    const res = await fetch(`${endpoint}/api/posts`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, images }),
    });

    if (!res.ok) throw new Error(`Post failed: ${res.status}`);
    return res.json();
};

const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
};

// Collect text content of existing static entries for dedup
const getStaticEntryTexts = () => {
    const texts = new Set();
    for (const el of document.querySelectorAll(".timeline .entry-body")) {
        const t = el.textContent.trim();
        if (t) texts.add(t);
    }
    return texts;
};

// Remove posted items that already appear in the static HTML
const cleanupPosted = async () => {
    const staticTexts = getStaticEntryTexts();
    const posted = await dbGetAll(POSTED_STORE);
    for (const post of posted) {
        if (staticTexts.has(post.text.trim())) {
            await dbDelete(POSTED_STORE, post.id);
        }
    }
};

const isTodayPage = () => {
    const p = location.pathname;
    if (p.endsWith("/today.html")) return true;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return p.endsWith(`/${y}/${m}/${d}.html`);
};

const renderLocalPosts = async () => {
    const timeline = document.querySelector(".timeline");
    if (!timeline || !isTodayPage()) return;

    const existing = document.querySelector(".local-posts");
    if (existing) existing.remove();

    const buildTime = document.body.dataset.buildTime;
    const buildTs = buildTime ? new Date(buildTime).getTime() : 0;

    const pending = await dbGetAll(PENDING_STORE);
    const posted = await dbGetAll(POSTED_STORE);
    const all = [
        ...pending.map((p) => ({ ...p, status: "pending" })),
        ...posted.filter((p) => p.createdAt > buildTs).map((p) => ({ ...p, status: "posted" })),
    ];
    if (all.length === 0) return;

    // Sort newest first
    all.sort((a, b) => b.createdAt - a.createdAt);

    const container = document.createElement("div");
    container.className = "local-posts";

    for (const post of all) {
        const el = document.createElement("article");
        el.className = "timeline-entry timeline-entry--microblog";
        const time = new Date(post.createdAt).toISOString().slice(11, 16);
        const badge = post.status === "pending" ? "PENDING" : "POSTED";
        const imagesHtml = (post.images || [])
            .map((img) => {
                const w = img.width ? ` width="${img.width}"` : "";
                const h = img.height ? ` height="${img.height}"` : "";
                return `<img src="${escapeHtml(img.url)}" class="entry-image" loading="lazy" alt=""${w}${h}>`;
            })
            .join("");
        el.innerHTML = `
            <time class="entry-time">${time}</time>
            <span class="entry-badge">${badge}</span>
            <div class="entry-body">${escapeHtml(post.text)}</div>
            ${imagesHtml ? `<div class="entry-images">${imagesHtml}</div>` : ""}
        `;
        container.appendChild(el);
    }

    timeline.parentNode.insertBefore(container, timeline);
};

const processQueue = async () => {
    const form = document.querySelector(".post-form");
    if (!form) return;

    const endpoint = form.dataset.endpoint;
    if (!endpoint) return;

    const posts = await dbGetAll(PENDING_STORE);
    for (const post of posts) {
        try {
            await submitPost(endpoint, post.text, post.images || []);
            await dbDelete(PENDING_STORE, post.id);
            // Move to posted store so it stays visible
            await dbAdd(POSTED_STORE, { text: post.text, images: post.images || [], createdAt: post.createdAt });
        } catch {
            break;
        }
    }
    await renderLocalPosts();
};

const initPostForm = () => {
    const form = document.getElementById("post-form");
    const postFormSection = document.querySelector(".post-form");
    if (!form || !postFormSection) return;

    const endpoint = postFormSection.dataset.endpoint;
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
                    const imageMeta = await uploadImage(endpoint, file);
                    images.push(imageMeta);
                }
            }

            if (!navigator.onLine) {
                await dbAdd(PENDING_STORE, { text, images, createdAt: Date.now() });
                setStatus("Saved offline. Will sync when online.", "success");
            } else {
                await submitPost(endpoint, text, images);
                // Save to posted store so it persists across reloads
                await dbAdd(POSTED_STORE, { text, images, createdAt: Date.now() });
                setStatus("Posted!", "success");
            }

            textEl.value = "";
            if (fileInput) fileInput.value = "";
            if (preview) preview.innerHTML = "";

            // Close post page after successful post
            if (location.pathname.endsWith("/post.html")) {
                setTimeout(() => history.back(), 500);
                return;
            }
            await renderLocalPosts();
        } catch (err) {
            await dbAdd(PENDING_STORE, { text, images: [], createdAt: Date.now() });
            setStatus(`Failed: ${err.message}. Queued for retry.`, "error");
            await renderLocalPosts();
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
    await cleanupPosted();
    initPostForm();
    await renderLocalPosts();
    initLightbox();
});

// Re-render local posts when navigating back (bfcache restore)
window.addEventListener("pageshow", async (e) => {
    if (e.persisted) {
        await cleanupPosted();
        await renderLocalPosts();
    }
});

// Online: process pending queue
window.addEventListener("online", () => {
    processQueue();
});
