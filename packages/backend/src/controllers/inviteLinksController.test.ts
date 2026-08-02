import { type SessionUser } from '@lightdash/common';
import express from 'express';
import { type ServiceRepository } from '../services/ServiceRepository';
import { sessionUser } from '../services/UserService.mock';
import { InviteLinksController } from './inviteLinksController';

describe('InviteLinksController', () => {
    test('activates an invite, logs in the session, and returns the registration response shape', async () => {
        const activateUserFromInviteWithoutPassword = vi.fn(
            async () => sessionUser,
        );
        const services = {
            getUserService: () => ({
                activateUserFromInviteWithoutPassword,
            }),
        } as unknown as ServiceRepository;
        const login = vi.fn(
            (user: SessionUser, done: (error?: Error | null) => void) => done(),
        );
        const req = { login } as unknown as express.Request;
        const controller = new InviteLinksController(services);

        await expect(
            controller.activateInviteLink(req, 'invite-code'),
        ).resolves.toEqual({
            status: 'ok',
            results: sessionUser,
        });

        expect(activateUserFromInviteWithoutPassword).toHaveBeenCalledWith(
            'invite-code',
        );
        expect(login).toHaveBeenCalledWith(sessionUser, expect.any(Function));
        expect(controller.getStatus()).toBe(200);
    });
});
