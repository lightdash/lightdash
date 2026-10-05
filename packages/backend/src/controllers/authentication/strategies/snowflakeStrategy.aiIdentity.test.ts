import { describe, expect, it, vi } from 'vitest';
import { enqueueAiIdentitySignIn } from './snowflakeStrategy';

describe('Snowflake sign-in AI identity hook', () => {
    it('enqueues the user update after credentials are stored', () => {
        const scheduleSignIn = vi.fn().mockResolvedValue(undefined);
        const req = {
            services: { getAiIdentityService: () => ({ scheduleSignIn }) },
        } as unknown as Express.Request;
        enqueueAiIdentitySignIn(req, 'user', 'organization');
        expect(scheduleSignIn).toHaveBeenCalledWith('organization', 'user');
    });

    it('does not enqueue without an organization', () => {
        const scheduleSignIn = vi.fn().mockResolvedValue(undefined);
        const req = {
            services: { getAiIdentityService: () => ({ scheduleSignIn }) },
        } as unknown as Express.Request;
        enqueueAiIdentitySignIn(req, 'user', undefined);
        expect(scheduleSignIn).not.toHaveBeenCalled();
    });
});
