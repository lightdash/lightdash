import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
    isOAuthPopupFlowRequest,
    oauthPopupCoopMiddleware,
} from './oauthPopupCoop';

const AUTHORIZE_REDIRECT =
    '/api/v1/oauth/authorize?response_type=code&client_id=abc&state=xyz';

describe('isOAuthPopupFlowRequest', () => {
    it.each([
        ['/api/v1/oauth/authorize', undefined],
        ['/api/v1/oauth/redirect/okta', undefined],
        ['/api/v1/oauth/redirect/google', undefined],
        ['/login', AUTHORIZE_REDIRECT],
        ['/login', '/api/v1/oauth/authorize'],
        ['/api/v1/login/okta', AUTHORIZE_REDIRECT],
        ['/api/v1/login/google', AUTHORIZE_REDIRECT],
    ])('relaxes %s (redirect=%s)', (path, redirect) => {
        expect(isOAuthPopupFlowRequest(path, redirect)).toBe(true);
    });

    it.each([
        ['/login', undefined],
        ['/login', '/projects'],
        ['/login', '/api/v1/oauth/authorize-other'],
        ['/login', '/api/v1/oauth/token'],
        ['/login', 'https://evil.example/api/v1/oauth/authorize'],
        ['/login', '//evil.example/api/v1/oauth/authorize'],
        ['/login', ['/api/v1/oauth/authorize']],
        ['/api/v1/login/okta', '/'],
        ['/', AUTHORIZE_REDIRECT],
        ['/register', AUTHORIZE_REDIRECT],
        ['/api/v1/health', undefined],
        ['/api/v1/oauth', undefined],
    ])('keeps the default for %s (redirect=%s)', (path, redirect) => {
        expect(isOAuthPopupFlowRequest(path, redirect)).toBe(false);
    });
});

describe('oauthPopupCoopMiddleware', () => {
    const run = (path: string, query: Record<string, unknown> = {}) => {
        const setHeader = vi.fn();
        const next = vi.fn() as NextFunction;
        oauthPopupCoopMiddleware(
            { path, query } as unknown as Request,
            { setHeader } as unknown as Response,
            next,
        );
        return { setHeader, next };
    };

    it('sets unsafe-none on the OAuth popup flow', () => {
        const { setHeader, next } = run('/login', {
            redirect: AUTHORIZE_REDIRECT,
        });
        expect(setHeader).toHaveBeenCalledWith(
            'Cross-Origin-Opener-Policy',
            'unsafe-none',
        );
        expect(next).toHaveBeenCalled();
    });

    it('leaves other requests untouched', () => {
        const { setHeader, next } = run('/login');
        expect(setHeader).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});
