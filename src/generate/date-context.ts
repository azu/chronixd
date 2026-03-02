type DateContext = {
    timezone: string | undefined;
};

let _context: DateContext | null = null;

export const initDateContext = (options: { timezone?: string | null }): void => {
    _context = { timezone: options.timezone ?? undefined };
};

export const getDateContext = (): DateContext => {
    if (_context === null) {
        throw new Error("DateContext is not initialized. Call initDateContext() first.");
    }
    return _context;
};
