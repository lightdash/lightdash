import type { Request, Response } from 'express';
import passport from 'passport';
import { authenticateBigquery, retryGoogleReconnect } from './googleReconnect';

vi.mock('passport', () => ({
    default: { authenticate: vi.fn(() => vi.fn()) },
}));
const user = { userUuid: 'user_a' };
const context = { subject: 'subject_a', email: 'account_a' };
const setup = (query: Record<string, string>, enabled = true) => {
    const service = {
        getGoogleReconnectContext: vi.fn(async () =>
            enabled ? context : undefined,
        ),
        validatePersonalBigqueryReconnect: vi.fn(async () => undefined),
    };
    const req = {
        query,
        user,
        session: {
            oauth: {
                isPopup: true,
                returnTo: '/projects/project_a/sql-runner',
            },
        },
        services: { getUserService: () => service },
    } as unknown as Request;
    return {
        req,
        service,
        res: {} as Response,
        next: vi.fn<(error?: unknown) => void>(),
    };
};
beforeEach(() => vi.clearAllMocks());

test.each([false, true])(
    'uses light authorization only when enabled: %s',
    async (enabled) => {
        const { req, res, next } = setup({ reconnect: 'true' }, enabled);
        await authenticateBigquery(req, res, next);
        const options = vi.mocked(passport.authenticate).mock.calls[0][1];
        expect(options).toMatchObject({
            accessType: 'offline',
            session: false,
        });
        if (enabled) {
            expect(options).not.toHaveProperty('prompt');
            expect(options).toHaveProperty('loginHint', context.email);
        } else expect(options).toHaveProperty('prompt', 'consent');
        expect(req.session.oauth).toMatchObject({
            isPopup: true,
            returnTo: '/projects/project_a/sql-runner',
        });
    },
);

test('settings links always request consent', async () => {
    const { req, res, next, service } = setup({});
    await authenticateBigquery(req, res, next);
    expect(service.getGoogleReconnectContext).not.toHaveBeenCalled();
    expect(passport.authenticate).toHaveBeenCalledWith(
        'google',
        expect.objectContaining({ prompt: 'consent' }),
    );
});

test('validates ownership before binding a personal credential to the session', async () => {
    const { req, res, next, service } = setup({
        personalCredentialUuid: 'credential_a',
    });
    service.validatePersonalBigqueryReconnect.mockRejectedValueOnce(
        new Error('denied'),
    );
    await authenticateBigquery(req, res, next);
    expect(passport.authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(req.session.oauth?.googlePersonalReconnect).toBeUndefined();
});

test('retries consent once and retains popup and redirect state', async () => {
    const { req, res, next } = setup({ reconnect: 'true' });
    await authenticateBigquery(req, res, next);
    req.session.oauth!.googleReconnect!.retryWithConsent = true;
    retryGoogleReconnect(req, res, next);
    expect(passport.authenticate).toHaveBeenLastCalledWith(
        'google',
        expect.objectContaining({
            prompt: 'consent',
            loginHint: context.email,
        }),
    );
    expect(req.session.oauth).toMatchObject({
        isPopup: true,
        returnTo: '/projects/project_a/sql-runner',
        googleReconnect: { consentAttempted: true, retryWithConsent: false },
    });
    retryGoogleReconnect(req, res, next);
    expect(passport.authenticate).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledOnce();
});
