import { ForbiddenError, type SessionUser } from '@lightdash/common';
import type express from 'express';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import { createRestrictUnverifiedSessionMiddleware } from './restrictUnverifiedSession';

const unverifiedUser: SessionUser = {
    ...defaultSessionUser,
    isEmailVerified: false,
};

const verifiedUser: SessionUser = {
    ...defaultSessionUser,
    isEmailVerified: true,
};

const buildRequest = ({
    method = 'POST',
    path = '/api/v1/user/me/personal-access-tokens',
    user = unverifiedUser,
    account,
    accepts = 'json',
}: {
    method?: string;
    path?: string;
    user?: SessionUser | null;
    account?: express.Request['account'];
    accepts?: 'json' | 'html';
}) =>
    ({
        method,
        path: path.split('?')[0],
        originalUrl: path,
        user: user ?? undefined,
        account,
        accepts: () => accepts,
    }) as unknown as express.Request;

const run = (
    request: express.Request,
    { hasEmailClient = true }: { hasEmailClient?: boolean } = {},
) => {
    const next = vi.fn();
    const redirect = vi.fn();
    createRestrictUnverifiedSessionMiddleware({ hasEmailClient })(
        request,
        { redirect } as unknown as express.Response,
        next,
    );
    return { next, redirect };
};

const expectForbidden = (next: ReturnType<typeof vi.fn>) => {
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
};

describe('createRestrictUnverifiedSessionMiddleware', () => {
    it('rejects an unverified session user', () => {
        const { next } = run(buildRequest({}));

        expectForbidden(next);
    });

    it('rejects an unverified session user when an embed token set the account', () => {
        const { next } = run(
            buildRequest({
                method: 'POST',
                path: '/api/v1/oauth/authorize?projectUuid=abc',
                account: buildAccount({ accountType: 'jwt' }),
            }),
        );

        expectForbidden(next);
    });

    it.each([
        '/API/v1/user/me/personal-access-tokens',
        '/Api/V1/User/Me/Personal-Access-Tokens',
        '/api/v1/user/me/personal-access-tokens/',
    ])('rejects the path variant %s', (path) => {
        const { next } = run(buildRequest({ path }));

        expectForbidden(next);
    });

    it.each([
        ['GET', '/api/v1/user'],
        ['GET', '/API/v1/user/account'],
        ['PUT', '/api/v1/user/me/email/otp'],
        ['GET', '/api/v1/user/me/email/status?passcode=000000'],
        ['GET', '/api/v1/logout'],
        ['DELETE', '/api/v1/user/me'],
    ])('allows %s %s', (method, path) => {
        const { next } = run(buildRequest({ method, path }));

        expect(next).toHaveBeenCalledWith();
    });

    it('allows a verified session user', () => {
        const { next } = run(buildRequest({ user: verifiedUser }));

        expect(next).toHaveBeenCalledWith();
    });

    it('allows a request without a session user', () => {
        const { next } = run(buildRequest({ user: null }));

        expect(next).toHaveBeenCalledWith();
    });

    it('allows every request when no email client is configured', () => {
        const { next } = run(buildRequest({}), { hasEmailClient: false });

        expect(next).toHaveBeenCalledWith();
    });

    it('allows paths outside the API', () => {
        const { next } = run(
            buildRequest({ method: 'GET', path: '/verify-email' }),
        );

        expect(next).toHaveBeenCalledWith();
    });

    it('redirects a browser page load to the verification page', () => {
        const path =
            '/api/v1/oauth/authorize?client_id=lightdash-cli&state=abc';
        const { next, redirect } = run(
            buildRequest({ method: 'GET', path, accepts: 'html' }),
        );

        expect(next).not.toHaveBeenCalled();
        expect(redirect).toHaveBeenCalledWith(
            `/verify-email?redirect=${encodeURIComponent(path)}`,
        );
    });

    it('rejects a browser form submission instead of redirecting', () => {
        const { next, redirect } = run(
            buildRequest({
                method: 'POST',
                path: '/api/v1/org',
                accepts: 'html',
            }),
        );

        expect(redirect).not.toHaveBeenCalled();
        expectForbidden(next);
    });
});
