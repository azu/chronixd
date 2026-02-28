/* eslint-disable no-console */
import { watch } from "fs";
import { resolve } from "path";

const INPUT = resolve(process.argv[2] ?? "./db");
const OUTPUT = resolve(process.argv[3] ?? "./dist");
const PORT = Number(process.env.PORT ?? "3000");
const WATCH_DIR = resolve("src/generate");

// Track SSE clients for live reload
const clients = new Set<ReadableStreamDefaultController>();

// Static file server with SSE inject
const INJECT_SCRIPT = `<script>new EventSource("/__reload").addEventListener("reload",()=>location.reload())</script>`;

const MIME: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
};

const getMime = (path: string): string => {
    const ext = path.slice(path.lastIndexOf("."));
    return MIME[ext] ?? "application/octet-stream";
};

const serve = Bun.serve({
    port: PORT,
    idleTimeout: 0,
    async fetch(req) {
        const url = new URL(req.url);

        // SSE endpoint for live reload
        if (url.pathname === "/__reload") {
            const stream = new ReadableStream({
                start(controller) {
                    clients.add(controller);
                    controller.enqueue("data: connected\n\n");
                },
                cancel(controller) {
                    clients.delete(controller);
                },
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                },
            });
        }

        // Serve static files
        let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = Bun.file(resolve(OUTPUT + filePath));
        if (!(await file.exists())) {
            return new Response("Not Found", { status: 404 });
        }

        const mime = getMime(filePath);
        if (mime === "text/html") {
            // Inject reload script into HTML
            let html = await file.text();
            html = html.replace("</body>", INJECT_SCRIPT + "</body>");
            return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }

        return new Response(file, { headers: { "Content-Type": mime } });
    },
});

console.log(`Dev server running at http://localhost:${serve.port}`);

// Run generate as subprocess so module changes are always picked up
const runGenerate = async () => {
    const start = performance.now();
    try {
        const proc = Bun.spawn(["bun", "run", "src/generate/cli-entry.ts", "--input", INPUT, "--output", OUTPUT, "--language", "ja"], {
            cwd: resolve("."),
            stdout: "inherit",
            stderr: "inherit",
        });
        const code = await proc.exited;
        const ms = Math.round(performance.now() - start);
        if (code !== 0) {
            console.error(`Generate failed with exit code ${code}`);
            return;
        }
        console.log(`Generated in ${ms}ms`);

        // Notify all SSE clients
        for (const client of clients) {
            try {
                client.enqueue("event: reload\ndata: {}\n\n");
            } catch {
                clients.delete(client);
            }
        }
    } catch (e) {
        console.error("Generate failed:", e);
    }
};

// Initial generate
await runGenerate();

// Watch src/generate for changes and rebuild
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(WATCH_DIR, { recursive: true }, (_event, filename) => {
    if (!filename || filename.endsWith(".test.ts")) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        console.log(`Changed: ${filename}`);
        runGenerate();
    }, 200);
});

console.log(`Watching ${WATCH_DIR} for changes...`);
