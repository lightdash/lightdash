import type { Account } from '@lightdash/common';
import type express from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import { RecentContentController } from './RecentContentController';

describe('RecentContentController', () => {
    const recordView = vi.fn();
    const controller = new RecentContentController({
        getRecentContentService: () => ({ recordView }),
    } as unknown as ConstructorParameters<typeof RecentContentController>[0]);
    const view = {
        projectUuid: 'project',
        contentType: 'dashboard' as const,
        contentUuid: 'dashboard',
    };
    beforeEach(() => {
        recordView.mockReset();
    });

    it.each(['jwt', 'service-account', 'personal-access-token', 'oauth'])(
        'rejects %s tracking',
        async (type) => {
            const account = { authentication: { type } } as Account;
            await expect(
                controller.recordView({ account } as express.Request, view),
            ).rejects.toThrow('not session auth');
            await expect(
                controller.getRecentlyViewed(
                    { account } as express.Request,
                    'project',
                ),
            ).rejects.toThrow('not session auth');
            expect(recordView).not.toHaveBeenCalled();
        },
    );

    it('derives the viewer from the session', async () => {
        const account = buildAccount();
        await controller.recordView({ account } as express.Request, view);
        expect(recordView).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: account.user.id }),
            view,
        );
    });
});
