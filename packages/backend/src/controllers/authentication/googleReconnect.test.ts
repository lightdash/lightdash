import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import passport from 'passport';
import { authenticateBigquery } from './googleReconnect';

vi.mock('passport', () => ({
    default: { authenticate: vi.fn(() => vi.fn()) },
}));
const user = { userUuid: 'user_a' };
const context = { subject: 'subject_a', email: 'account_a' };
const setup = (query: Record<string, string>, hasIdentity = true) => {
    const service = {
        getGoogleReconnectContext: vi.fn(async () =>
            hasIdentity ? context : undefined,
        ),
        validatePersonalBigqueryReconnect: vi.fn(async () => undefined),
    };
    const req = {
        query,
        user,
        session: {
            oauth: {
                isPopup: true,
                intent: 'link',
                returnTo: '/projects/project_a/sql-runner',
            },
        },
        services: { getUserService: () => service },
    } as unknown as Request;
    return {
        req,
        service,
        res: { redirect: vi.fn() } as unknown as Response,
        next: vi.fn<(error?: unknown) => void>(),
    };
};
beforeEach(() => vi.clearAllMocks());

test.each([false, true])(
    'omits consent for explicit reconnect with identity available: %s',
    async (hasIdentity) => {
        const { req, res, next } = setup({ reconnect: 'true' }, hasIdentity);
        await authenticateBigquery(req, res, next);
        const options = vi.mocked(passport.authenticate).mock.calls[0][1];
        expect(options).toMatchObject({
            accessType: 'offline',
            session: false,
        });
        expect(options).not.toHaveProperty('prompt');
        if (hasIdentity)
            expect(options).toHaveProperty('loginHint', context.email);
        expect(req.session.oauth?.googleReconnect).toMatchObject({
            userUuid: user.userUuid,
            subject: hasIdentity ? context.subject : null,
            email: hasIdentity ? context.email : null,
        });
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
        personalCredentialUuid: randomUUID(),
        reconnect: 'true',
    });
    service.validatePersonalBigqueryReconnect.mockRejectedValueOnce(
        new Error('denied'),
    );
    await authenticateBigquery(req, res, next);
    expect(passport.authenticate).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/auth/popup/failure'),
    );
    expect(next).not.toHaveBeenCalled();
    expect(req.session.oauth?.googlePersonalReconnect).toBeUndefined();
});

test('an explicit reconnect without a login fails without a forced-consent authorization', async () => {
    const { req, res, next } = setup({ reconnect: 'true' });
    req.user = undefined;
    await authenticateBigquery(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/auth/popup/failure'),
    );
    expect(passport.authenticate).not.toHaveBeenCalled();
});
