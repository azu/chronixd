import type { ServiceView } from "./types.js";
import { defaultView } from "./default.js";
import { blueskyView } from "./bluesky.js";
import { microblogView } from "./microblog.js";
import { locationView } from "./location.js";

const viewMap: Record<string, ServiceView> = {
    bluesky: blueskyView,
    microblog: microblogView,
    location: locationView,
};

export const getView = (serviceDir: string): ServiceView => {
    return viewMap[serviceDir] ?? defaultView;
};
