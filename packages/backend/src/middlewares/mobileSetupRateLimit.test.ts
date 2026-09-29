import { type Request, type Response } from 'express';
import { createMobileSetupRateLimit } from './mobileSetupRateLimit';

describe('mobile setup challenge flood limit', () => {
    afterEach(() => vi.useRealTimers());
    it('blocks excess requests and permits a retry after the window expires', () => {
        vi.useFakeTimers();
        const limit = createMobileSetupRateLimit();
        const req = { ip: '127.0.0.1' } as Request;
        const res = {
            set: vi.fn(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        } as unknown as Response;
        const next = vi.fn();
        for (let index = 0; index < 31; index += 1) limit(req, res, next);
        expect(next).toHaveBeenCalledTimes(30);
        expect(res.status).toHaveBeenCalledWith(429);
        vi.advanceTimersByTime(60_000);
        limit(req, res, next);
        expect(next).toHaveBeenCalledTimes(31);
    });
});
