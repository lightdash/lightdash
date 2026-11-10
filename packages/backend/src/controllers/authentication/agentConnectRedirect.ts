import { ParameterError } from '@lightdash/common';
import { SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE } from '@lightdash/warehouses';
import { type Request, type RequestHandler } from 'express';
import { lightdashConfig } from '../../config/lightdashConfig';

const parseAgentConnectRedirect = (redirect: string): URL | null => {
    try {
        const url = new URL(redirect, lightdashConfig.siteUrl);
        if (
            url.username ||
            url.password ||
            !['http:', 'https:'].includes(url.protocol)
        ) {
            return null;
        }
        const isSiteHost = url.host === new URL(lightdashConfig.siteUrl).host;
        const isLoopback =
            url.protocol === 'http:' &&
            /^http:\/\/(localhost|127\.0\.0\.1):\d+(?:[/?#]|$)/i.test(redirect);
        return isSiteHost || isLoopback ? url : null;
    } catch {
        return null;
    }
};

export const storeAgentConnectRedirect: RequestHandler = (req, _res, next) => {
    const { redirect, isPopup } = req.query;
    req.session.oauth = {};
    if (typeof redirect === 'string') {
        const url = parseAgentConnectRedirect(redirect);
        if (url) req.session.oauth.returnTo = redirect;
    }
    if (isPopup === 'true') req.session.oauth.isPopup = true;
    next();
};

const getAgentConnectErrorCode = (error: unknown): string => {
    if (error instanceof Error) {
        if (error.message.includes(SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE)) {
            return 'not_agent_session';
        }
        if (error instanceof ParameterError) return 'no_refresh_token';
        if (error.message.includes('Enterprise license required')) {
            return 'license_required';
        }
    }
    return 'sign_in_failed';
};

export const getAgentConnectRedirectURL =
    (isSuccess: boolean, error?: unknown) =>
    (req: Request): string => {
        if (req.session.oauth?.isPopup) {
            return new URL(
                isSuccess ? '/auth/popup/success' : '/auth/popup/failure',
                lightdashConfig.siteUrl,
            ).href;
        }
        const returnTo = req.session.oauth?.returnTo;
        const url =
            (typeof returnTo === 'string'
                ? parseAgentConnectRedirect(returnTo)
                : null) ?? new URL('/', lightdashConfig.siteUrl);
        if (!isSuccess) {
            url.searchParams.set('error', getAgentConnectErrorCode(error));
        }
        return url.href;
    };
