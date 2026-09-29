import { type RequestHandler } from 'express';

export const createMobileSetupRateLimit = (): RequestHandler => {
    const windows = new Map<string, { expiresAt: number; count: number }>();
    return (req, res, next) => {
        const now = Date.now();
        for (const [key, window] of windows) {
            if (window.expiresAt <= now) windows.delete(key);
        }
        const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        const window = windows.get(key) ?? {
            expiresAt: now + 60_000,
            count: 0,
        };
        if (
            window.count >= 30 ||
            (!windows.has(key) && windows.size >= 10_000)
        ) {
            res.set('Cache-Control', 'no-store');
            res.set('Retry-After', '60');
            res.status(429).json({
                error: 'slow_down',
                error_description: 'Try again in one minute',
            });
            return;
        }
        window.count += 1;
        windows.set(key, window);
        next();
    };
};
