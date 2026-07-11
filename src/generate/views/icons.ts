// Simple SVG icons for each service (16x16, monochrome, currentColor)
// Based on Simple Icons / Lucide-style designs

const icon = (svg: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;

const filledIcon = (svg: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">${svg}</svg>`;

export const serviceIcons: Record<string, string> = {
    // GitHub - Octocat silhouette (simplified)
    github: filledIcon('<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>'),

    // Bluesky - butterfly
    bluesky: filledIcon('<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.63 3.65 3.502 6.356 3.147-4.94.81-6.588 3.396-3.69 5.99 3.266 2.457 6.2-.29 7.462-3.08.19-.42.337-.834.438-1.185.1.351.248.764.438 1.185 1.262 2.79 4.196 5.537 7.462 3.08 2.898-2.594 1.25-5.18-3.69-5.99 2.706.355 5.57-.516 6.356-3.147.246-.828.624-5.79.624-6.48 0-.687-.14-1.859-.902-2.202-.66-.299-1.664-.62-4.3 1.24C14.046 4.747 11.087 8.686 12 10.8z"/>'),

    // Slack - hash
    slack: icon('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>'),

    // Calendar - calendar
    calendar: icon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),

    // Linear - target/crosshair
    linear: icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),

    // Bookmark - bookmark
    bookmark: icon('<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>'),

    // WakaTime - clock
    wakatime: icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),

    // Location - map-pin
    location: icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>'),

    // Microblog - edit/pen
    microblog: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'),

    // RSS - rss
    rss: icon('<path d="M4 11a9 9 0 019 9"/><path d="M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1"/>'),

    // Notion - file-text
    notion: icon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'),

    // Oura - ring
    oura: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>'),
};

// Inline icons for use within entry body/meta (not badges)
export const inlineIcons = {
    code: icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
    folder: icon('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'),
};

export const getServiceIcon = (service: string): string => {
    return serviceIcons[service] ?? "";
};
