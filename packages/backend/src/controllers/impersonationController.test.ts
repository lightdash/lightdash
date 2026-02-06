import { ForbiddenError } from '@lightdash/common';
import express from 'express';
import { buildAccount, defaultSessionUser } from '../auth/account/account.mock';
import { type ServiceRepository } from '../services/ServiceRepository';
import { ImpersonationController } from './impersonationController';

describe('ImpersonationController', () => {
    const userService = {
        startImpersonation: jest.fn(),
        stopImpersonation: jest.fn(),
    };

    const controller = new ImpersonationController({
        getUserService: () => userService,
    } as unknown as ServiceRepository);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects start when auth type is not session', async () => {
        const request = {
            account: {
                authentication: {
                    type: 'pat',
                },
            },
            user: defaultSessionUser,
            session: {},
        } as unknown as express.Request;

        await expect(
            controller.startImpersonation(request, {
                targetUserUuid: 'target-user-uuid',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(userService.startImpersonation).not.toHaveBeenCalled();
    });

    it('starts impersonation for session-authenticated users', async () => {
        const request = {
            account: buildAccount({ accountType: 'session' }),
            user: defaultSessionUser,
            session: {},
        } as unknown as express.Request;

        await controller.startImpersonation(request, {
            targetUserUuid: 'target-user-uuid',
        });

        expect(userService.startImpersonation).toHaveBeenCalledWith(
            request.user,
            'target-user-uuid',
            request.session,
        );
    });

    it('rejects stop when auth type is not session', async () => {
        const request = {
            account: {
                authentication: {
                    type: 'oauth',
                },
            },
            user: defaultSessionUser,
            session: {},
        } as unknown as express.Request;

        await expect(controller.stopImpersonation(request)).rejects.toThrow(
            ForbiddenError,
        );
        expect(userService.stopImpersonation).not.toHaveBeenCalled();
    });
});
