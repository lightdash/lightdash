import { ForbiddenError, ParameterError } from '@lightdash/common';
import { SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE } from '@lightdash/warehouses';
import { type Request, type Response } from 'express';
import {
    getAgentConnectRedirectURL,
    storeAgentConnectRedirect,
} from './agentConnectRedirect';

vi.mock('../../config/lightdashConfig', () => ({
    lightdashConfig: { siteUrl: 'https://app.example' },
}));

const makeRequest = (redirect?: string, isPopup?: string) =>
    ({ query: { redirect, isPopup }, session: {} }) as unknown as Request;

describe('agent connect redirects', () => {
    it.each([
        ['/agent-connected', 'https://app.example/agent-connected'],
        [
            'https://app.example/done?x=1#done',
            'https://app.example/done?x=1#done',
        ],
        ['http://localhost:4321/done', 'http://localhost:4321/done'],
        ['http://127.0.0.1:65000/x', 'http://127.0.0.1:65000/x'],
        ['http://localhost:80/done', 'http://localhost/done'],
    ])('accepts %s and preserves the success target', (redirect, expected) => {
        const req = makeRequest(redirect);
        const next = vi.fn();
        storeAgentConnectRedirect(req, {} as Response, next);
        expect(next).toHaveBeenCalledExactlyOnceWith();
        expect(req.session.oauth?.returnTo).toBe(redirect);
        expect(getAgentConnectRedirectURL(true)(req)).toBe(expected);
    });

    it.each([
        'https://localhost:4321/done',
        'http://localhost/done',
        'https://127.0.0.1:65000/x',
        'http://evil.example/x',
        'http://localhost@evil.example/',
        'http://user@localhost:4321/done',
        'https://user@app.example/done',
        ['javascript', 'alert(1)'].join(':'),
        '//evil.example/done',
        'http://localhost.evil.example:4321/done',
        'ftp://app.example/done',
        'http://[',
    ])('rejects %s at both redirect boundaries', (redirect) => {
        const req = makeRequest(redirect);
        const next = vi.fn();
        storeAgentConnectRedirect(req, {} as Response, next);
        expect(next).toHaveBeenCalledExactlyOnceWith();
        expect(req.session.oauth?.returnTo).toBeUndefined();
        expect(getAgentConnectRedirectURL(true)(req)).toBe(
            'https://app.example/',
        );
        req.session.oauth = { returnTo: redirect };
        expect(getAgentConnectRedirectURL(true)(req)).toBe(
            'https://app.example/',
        );
    });

    it('ignores external redirects even in development', () => {
        vi.stubEnv('NODE_ENV', 'development');
        try {
            const req = makeRequest('https://evil.example/');
            storeAgentConnectRedirect(req, {} as Response, vi.fn());
            expect(getAgentConnectRedirectURL(true)(req)).toBe(
                'https://app.example/',
            );
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it.each([
        [
            new ForbiddenError(SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE),
            'not_agent_session',
        ],
        [
            new ParameterError('Snowflake did not return a refresh token.'),
            'no_refresh_token',
        ],
        [
            new ForbiddenError(
                'Enterprise license required for Snowflake agent sign-in',
            ),
            'license_required',
        ],
        [
            Object.assign(new Error('Token exchange failed'), {
                code: 'invalid_grant',
            }),
            'sign_in_failed',
        ],
        [undefined, 'sign_in_failed'],
    ])('maps %s to error=%s', (error, code) => {
        const req = makeRequest('/agent-connected?client=cli#result');
        storeAgentConnectRedirect(req, {} as Response, vi.fn());
        expect(getAgentConnectRedirectURL(false, error)(req)).toBe(
            `https://app.example/agent-connected?client=cli&error=${code}#result`,
        );
    });

    it('adds failures to loopback redirects and replaces a stale error', () => {
        const req = makeRequest(
            'http://localhost:4321/done?error=old&state=123',
        );
        storeAgentConnectRedirect(req, {} as Response, vi.fn());
        expect(getAgentConnectRedirectURL(false)(req)).toBe(
            'http://localhost:4321/done?error=sign_in_failed&state=123',
        );
    });

    it('uses the site root when no redirect is provided', () => {
        const req = makeRequest();
        storeAgentConnectRedirect(req, {} as Response, vi.fn());
        expect(getAgentConnectRedirectURL(true)(req)).toBe(
            'https://app.example/',
        );
        expect(getAgentConnectRedirectURL(false)(req)).toBe(
            'https://app.example/?error=sign_in_failed',
        );
    });

    it.each([true, false])(
        'preserves popup pages for success=%s',
        (success) => {
            const req = makeRequest('http://localhost:4321/done', 'true');
            storeAgentConnectRedirect(req, {} as Response, vi.fn());
            expect(req.session.oauth?.isPopup).toBe(true);
            expect(getAgentConnectRedirectURL(success)(req)).toBe(
                `https://app.example/auth/popup/${success ? 'success' : 'failure'}`,
            );
        },
    );
});
