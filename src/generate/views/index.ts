import type { ServiceView } from "./types.js";
import { defaultView } from "./default.js";
import { blueskyView } from "./bluesky.js";
import { microblogView } from "./microblog.js";
import { locationView } from "./location.js";
import { slackView } from "./slack.js";
import { calendarView } from "./calendar.js";
import { linearView } from "./linear.js";
import { bookmarkView } from "./bookmark.js";
import { wakatimeView } from "./wakatime.js";
import { githubView } from "./github.js";

const viewMap: Record<string, ServiceView> = {
    bluesky: blueskyView,
    microblog: microblogView,
    location: locationView,
    slack: slackView,
    calendar: calendarView,
    linear: linearView,
    "asocial-bookmark": bookmarkView,
    wakatime: wakatimeView,
    "github-events": githubView,
    "github-search": githubView,
};

export const getView = (serviceDir: string): ServiceView => {
    return viewMap[serviceDir] ?? defaultView;
};
