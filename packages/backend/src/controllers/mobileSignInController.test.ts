import { ForbiddenError, MobileSignInRefusal } from '@lightdash/common';
import express from 'express';
import { fromApiKey, fromSession } from '../auth/account/account';
import { lightdashConfig } from '../config/lightdashConfig';
import { type ServiceRepository } from '../services/ServiceRepository';
import { sessionUser } from '../services/UserService.mock';
import { MobileSignInController } from './mobileSignInController';

const siteOrigin = new URL(lightdashConfig.siteUrl).origin;

const browserRequest = ({
    origin = siteOrigin,
    authType = 'session',
}: { origin?: string; authType?: 'session' | 'pat' } = {}) =>
    ({
        user: sessionUser,
        sessionID: 'session-0000-test',
        session: { passport: { user: sessionUser.userUuid } },
        isAuthenticated: () => true,
        account:
            authType === 'session'
                ? fromSession(sessionUser, 'session-0000-test')
                : fromApiKey(sessionUser, 'ApiKey ldpat_0000test'),
        ip: '203.0.113.7',
        get: (name: string) =>
            name.toLowerCase() === 'origin' ? origin : undefined,
    }) as unknown as express.Request;

const createController = () => {
    const service = {
        mint: vi.fn(async () => ({ codeUuid: 'code-0000-test' })),
        getState: vi.fn(async () => ({ status: 'pending' })),
        decide: vi.fn(async () => ({ status: 'approved', matchNumber: '07' })),
        cancel: vi.fn(async () => undefined),
    };
    const services = {
        getMobileSignInService: () => service,
    } as unknown as ServiceRepository;
    return { controller: new MobileSignInController(services), service };
};

const expectReason = async (
    promise: Promise<unknown>,
    reason: MobileSignInRefusal,
) => {
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).data).toMatchObject({ reason });
};

describe('MobileSignInController', () => {
    it('mints for the browser session', async () => {
        const { controller, service } = createController();
        await controller.mint(browserRequest(), { reason: 'show' });
        expect(service.mint).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: sessionUser.userUuid }),
            'session-0000-test',
            'show',
        );
    });

    it('refuses a personal access token', async () => {
        const { controller, service } = createController();
        await expectReason(
            controller.mint(browserRequest({ authType: 'pat' }), {
                reason: 'show',
            }),
            MobileSignInRefusal.FEATURE_DISABLED,
        );
        expect(service.mint).not.toHaveBeenCalled();
    });

    it('refuses a state change from another origin', async () => {
        const { controller, service } = createController();
        const req = browserRequest({ origin: 'https://evil.example' });
        await expectReason(
            controller.approve(req, 'code-0000-test', { nonce: 'n' }),
            MobileSignInRefusal.APPROVAL_SESSION_MISMATCH,
        );
        await expectReason(
            controller.cancel(req, 'code-0000-test'),
            MobileSignInRefusal.APPROVAL_SESSION_MISMATCH,
        );
        expect(service.decide).not.toHaveBeenCalled();
        expect(service.cancel).not.toHaveBeenCalled();
    });

    it('allows the status read without an origin header', async () => {
        const { controller, service } = createController();
        await controller.getState(
            browserRequest({ origin: undefined as never }),
            'code-0000-test',
        );
        expect(service.getState).toHaveBeenCalled();
    });

    it('refuses a decision without a nonce', async () => {
        const { controller, service } = createController();
        await expectReason(
            controller.decline(browserRequest(), 'code-0000-test', {
                nonce: '',
            }),
            MobileSignInRefusal.APPROVAL_SESSION_MISMATCH,
        );
        expect(service.decide).not.toHaveBeenCalled();
    });

    it('passes the session, nonce and decision to the service', async () => {
        const { controller, service } = createController();
        await controller.approve(browserRequest(), 'code-0000-test', {
            nonce: 'nonce-0000-test',
        });
        expect(service.decide).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: sessionUser.userUuid }),
            'session-0000-test',
            'code-0000-test',
            'nonce-0000-test',
            'approved',
            { ip: '203.0.113.7', userAgent: undefined },
        );
    });

    it('rejects an unknown mint reason', async () => {
        const { controller } = createController();
        await expect(
            controller.mint(browserRequest(), {
                reason: 'other' as never,
            }),
        ).rejects.toThrow('reason');
    });
});
