import { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

export const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 5, // Limit each IP to 100 requests per `window` (here, per minute).
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
});

export const rateLimiter: RequestHandler = (req, res, next) =>
    limiter(req, res, next);
