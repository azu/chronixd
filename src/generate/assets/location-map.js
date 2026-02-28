// Lazy-load Leaflet and init location maps when visible
(function () {
    const mapEls = document.querySelectorAll("[data-location-points]");
    if (mapEls.length === 0) return;

    let leafletLoaded = false;
    let leafletReady = null;

    const loadLeaflet = () => {
        if (leafletReady) return leafletReady;
        leafletReady = new Promise((resolve) => {
            // CSS
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(link);
            // JS
            const script = document.createElement("script");
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.onload = () => {
                leafletLoaded = true;
                resolve();
            };
            document.head.appendChild(script);
        });
        return leafletReady;
    };

    const initMap = async (el) => {
        if (el._mapInit) return;
        el._mapInit = true;

        const raw = el.getAttribute("data-location-points");
        if (!raw) return;

        let points;
        try {
            points = JSON.parse(raw);
        } catch {
            return;
        }
        if (!points || points.length === 0) return;

        await loadLeaflet();

        const container = document.createElement("div");
        container.style.height = el.dataset.mapHeight || "240px";
        container.style.borderRadius = "3px";
        container.style.cursor = "pointer";
        el.appendChild(container);

        // Click to open Google Maps at the center of the points
        const centerLat = points.reduce((s, p) => s + p[0], 0) / points.length;
        const centerLng = points.reduce((s, p) => s + p[1], 0) / points.length;
        container.addEventListener("click", () => {
            window.open(`https://www.google.com/maps/@${centerLat},${centerLng},16z`, "_blank");
        });

        const map = L.map(container, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            maxNativeZoom: 19,
        }).addTo(map);

        if (points.length === 1) {
            map.setView(points[0], 19);
            L.circleMarker(points[0], { radius: 5, color: "#c0392b", fillOpacity: 0.8 }).addTo(map);
        } else {
            const latlngs = points.map((p) => L.latLng(p[0], p[1]));
            const polyline = L.polyline(latlngs, { color: "#c0392b", weight: 2, opacity: 0.6 }).addTo(map);
            map.fitBounds(polyline.getBounds(), { padding: [20, 20], maxZoom: 19 });
        }

        // Small attribution text
        L.control.attribution({ prefix: false }).addTo(map);
        map.attributionControl.addAttribution('&copy; <a href="https://osm.org/copyright">OSM</a>');
    };

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    initMap(entry.target);
                    observer.unobserve(entry.target);
                }
            }
        },
        { rootMargin: "200px" }
    );

    mapEls.forEach((el) => observer.observe(el));
})();
