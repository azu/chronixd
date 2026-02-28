// chronixd post client — handles microblog posting, offline queue, pending posts

const DB_NAME = "chronixd-posts";
const DB_VERSION = 1;
const STORE_NAME = "pending";

const openDB = () => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const addPending = async (post) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).add(post);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const getAllPending = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const removePending = async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const getToken = () => {
    return localStorage.getItem("chronixd-token") || "";
};

const setStatus = (msg, type = "") => {
    const el = document.getElementById("post-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "post-status" + (type ? ` post-status--${type}` : "");
};

// Returns ImageMeta: { url, width?, height?, content_type?, size? }
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

const renderPendingPosts = async () => {
    const timeline = document.querySelector(".timeline");
    if (!timeline) return;

    const existing = document.querySelector(".pending-posts");
    if (existing) existing.remove();

    const posts = await getAllPending();
    if (posts.length === 0) return;

    const container = document.createElement("div");
    container.className = "pending-posts";
    container.innerHTML = `<h3>Pending (${posts.length})</h3>`;

    for (const post of posts) {
        const el = document.createElement("article");
        el.className = "timeline-entry";
        const imagesHtml = (post.images || [])
            .map((img) => {
                const w = img.width ? ` width="${img.width}"` : "";
                const h = img.height ? ` height="${img.height}"` : "";
                return `<img src="${escapeHtml(img.url)}" class="entry-image" loading="lazy" alt=""${w}${h}>`;
            })
            .join("");
        el.innerHTML = `
            <time class="entry-time">${new Date(post.createdAt).toISOString().slice(11, 16)}</time>
            <span class="entry-badge">PENDING</span>
            <div class="entry-body">${escapeHtml(post.text)}</div>
            ${imagesHtml ? `<div class="entry-images">${imagesHtml}</div>` : ""}
        `;
        container.appendChild(el);
    }

    timeline.parentNode.insertBefore(container, timeline);
};

const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
};

const processQueue = async () => {
    const form = document.querySelector(".post-form");
    if (!form) return;

    const endpoint = form.dataset.endpoint;
    if (!endpoint) return;

    const posts = await getAllPending();
    for (const post of posts) {
        try {
            await submitPost(endpoint, post.text, post.images || []);
            await removePending(post.id);
        } catch {
            break; // stop on first failure
        }
    }
    await renderPendingPosts();
};

const initPostForm = () => {
    const form = document.getElementById("post-form");
    const postFormSection = document.querySelector(".post-form");
    if (!form || !postFormSection) return;

    const endpoint = postFormSection.dataset.endpoint;
    if (!endpoint) return;

    // Token prompt if not set
    if (!getToken()) {
        const token = prompt("Enter your API token for posting:");
        if (token) localStorage.setItem("chronixd-token", token);
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
            // Upload images first — each returns an ImageMeta object
            const images = [];
            if (fileInput && fileInput.files.length > 0) {
                for (const file of fileInput.files) {
                    const imageMeta = await uploadImage(endpoint, file);
                    images.push(imageMeta);
                }
            }

            if (!navigator.onLine) {
                await addPending({ text, images, createdAt: Date.now() });
                setStatus("Saved offline. Will sync when online.", "success");
            } else {
                await submitPost(endpoint, text, images);
                setStatus("Posted!", "success");
            }

            textEl.value = "";
            if (fileInput) fileInput.value = "";
            if (preview) preview.innerHTML = "";
            await renderPendingPosts();
        } catch (err) {
            // Queue for retry
            await addPending({ text, images: [], createdAt: Date.now() });
            setStatus(`Failed: ${err.message}. Queued for retry.`, "error");
            await renderPendingPosts();
        } finally {
            submitBtn.disabled = false;
        }
    });
};

// Init
document.addEventListener("DOMContentLoaded", () => {
    initPostForm();
    renderPendingPosts();
});

// Online: process queue
window.addEventListener("online", () => {
    processQueue();
});
