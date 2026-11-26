import { ForbiddenError } from '@lightdash/common';
import type { Request, Response } from 'express';
import { unauthorisedWhileImpersonating } from './middlewares';

const run = (req: Partial<Request>) => {
    const next = vi.fn();
    unauthorisedWhileImpersonating(req as Request, {} as Response, next);
    return next;
};

const impersonation = {
    adminId: 'admin-uuid',
    adminEmail: 'admin@lightdash.com',
    adminRole: 'admin',
};

describe('unauthorisedWhileImpersonating', () => {
    it('lets an ordinary session through', () => {
        expect(run({ user: {} as Express.User })).toHaveBeenCalledOnce();
    });

    it('refuses when the resolved user is impersonated', () => {
        expect(() => run({ user: { impersonation } as Express.User })).toThrow(
            ForbiddenError,
        );
    });

    it('refuses when the session still holds an impersonation', () => {
        expect(() =>
            run({
                session: {
                    impersonation: { targetUserUuid: 'target-uuid' },
                } as Request['session'],
            }),
        ).toThrow(ForbiddenError);
    });
});
