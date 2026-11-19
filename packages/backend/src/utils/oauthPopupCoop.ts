import type { RequestHandler } from 'express';

const OAUTH_ROUTES_PREFIX = '/api/v1/oauth/';
const OAUTH_AUTHORIZE_PATH = '/api/v1/oauth/authorize';
const PATH_PROBE_ORIGIN = 'https://path-probe.invalid';

const isAuthorizeRedirect = (redirect: unknown): boolean => {
    if (typeof redirect !== 'string') return false;
    try {
        const url = new URL(redirect, PATH_PROBE_ORIGIN);
        return (
            url.origin === PATH_PROBE_ORIGIN &&
            url.pathname === OAUTH_AUTHORIZE_PATH
        );
    } catch {
        return false;
    }
};

/**
 * Pages a popup-based OAuth client passes through while signing in. Any of
 * them sending COOP `same-origin` permanently nulls the popup's
 * `window.opener`, so the client can never receive the authorization result.
 */
export const isOAuthPopupFlowRequest = (
    path: string,
    redirect: unknown,
): boolean => {
    if (path.startsWith(OAUTH_ROUTES_PREFIX)) return true;
    if (path === '/login' || path.startsWith('/api/v1/login/')) {
        return isAuthorizeRedirect(redirect);
    }
    return false;
};

export const oauthPopupCoopMiddleware: RequestHandler = (req, res, next) => {
    if (isOAuthPopupFlowRequest(req.path, req.query.redirect)) {
        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    }
    next();
};
