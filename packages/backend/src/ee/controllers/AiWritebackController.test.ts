import { type Account } from '@lightdash/common';
import type express from 'express';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import type { ServiceRepository } from '../../services/ServiceRepository';
import { AiWritebackController } from './AiWritebackController';

it.each(['oauth', 'session', 'pat'] as const)(
    'carries REST %s permission applicability into writeback runs',
    async (type) => {
        const run = vi.fn().mockResolvedValue({});
        const controller = new AiWritebackController({
            getAiWritebackService: () => ({ run }),
        } as unknown as ServiceRepository);
        const account = fromSession(defaultSessionUser);
        await controller.runAiWriteback(
            {
                account: {
                    ...account,
                    authentication: {
                        type,
                        source: 'test',
                        token: 'test',
                        clientId: 'test',
                        scopes: [],
                    },
                } as Account,
            } as express.Request,
            'project-uuid',
            { prompt: 'add a metric' },
        );
        expect(run).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'api',
                agentPermissionsApply: type === 'oauth',
            }),
        );
    },
);
