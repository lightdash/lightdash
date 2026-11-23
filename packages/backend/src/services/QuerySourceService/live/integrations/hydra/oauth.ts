import {
    HYDRA_OAUTH_CLIENT_ID,
    HYDRA_OAUTH_CLIENT_SECRET,
    type HydraScope,
    type HydraSettings,
} from '@lightdash/common';
import { createHash, randomBytes } from 'node:crypto';
import type { LiveHttpRequest, LiveHttpResponse } from '../../types';

/**
 * Hydra's sign-in for each viewer: an OAuth 2.0 authorization-code grant
 * with PKCE, answered in-process, as strict as a careful vendor's.
 *
 * - Codes are single use, expire after a minute, and are bound to the
 *   client, the redirect URI and the source that asked for them.
 * - Tokens are bound to that source; another source's calls refuse them.
 * - Refresh tokens rotate, and replaying one already rotated revokes the
 *   person's whole sign-in, as Okta and Auth0 do.
 * - Settings revoke a person's sign-ins, limit what they may read, or make
 *   the consent screen decline.
 *
 * Tokens carry what they grant, so any backend process reads them. What
 * must be remembered (used codes, rotated refresh tokens) is kept per
 * process; another process misses a replay rather than refusing a fresh
 * token. Nothing is signed: Hydra is test data, on only in development and
 * previews.
 */

const CODE_PREFIX = 'hydra-code';
const ACCESS_PREFIX = 'hydra-at';
const REFRESH_PREFIX = 'hydra-rt';

export const HYDRA_CODE_TTL_MS = 60_000;

type CodeClaims = {
    sub: string;
    src: string;
    cid: string;
    ruri: string;
    ch: string;
    iat: number;
    jti: string;
};
type AccessClaims = { sub: string; src: string; fam: string; exp: number };
type RefreshClaims = { sub: string; src: string; fam: string; gen: number };

const nonce = () => randomBytes(9).toString('base64url');

const encode = (prefix: string, claims: object) =>
    `${prefix}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;

const decode = <T>(prefix: string, token: string): T | null => {
    const [tokenPrefix, payload, ...rest] = token.split('.');
    if (tokenPrefix !== prefix || !payload || rest.length > 0) return null;
    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString()) as T;
    } catch {
        return null;
    }
};

const json = (status: number, body: unknown): LiveHttpResponse => ({
    status,
    headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
    },
    body,
});

const oauthError = (status: number, error: string, description: string) =>
    json(status, { error, error_description: description });

const isRevoked = (settings: HydraSettings, subject: string) =>
    settings.revokedViewers.includes(subject);

/** Whose rows a call reads, or why Hydra refuses its token. */
export type HydraIdentity =
    | { kind: 'shared'; seed: string }
    | { kind: 'viewer'; subject: string; seed: string }
    | { kind: 'rejected'; message: string };

/** The scope a report call needs, beyond the report's own. */
const getRequiredScopes = (
    request: Pick<LiveHttpRequest, 'method' | 'path' | 'body'>,
    reportPath: string,
): HydraScope[] => {
    if (request.method !== 'POST' || request.path !== reportPath) return [];
    const body = (request.body ?? {}) as {
        report?: unknown;
        metrics?: unknown;
    };
    const scopes: HydraScope[] = [];
    if (body.report === 'events') scopes.push('events:read');
    if (body.report === 'users') scopes.push('users:read');
    if (Array.isArray(body.metrics) && body.metrics.includes('revenue')) {
        scopes.push('revenue:read');
    }
    return scopes;
};

/** A redirect back to the app, as the consent screen answers. */
export type HydraConsentAnswer =
    | { kind: 'redirect'; location: string }
    | { kind: 'invalid'; message: string };

export type HydraAuthorizeParams = {
    response_type?: string;
    client_id?: string;
    redirect_uri?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
};

/** One call as Hydra saw it, so tests can check whose token it carried. */
export type HydraLoggedCall = {
    callNumber: number;
    method: string;
    path: string;
    /** The person whose own sign-in made the call; null for a shared token. */
    subject: string | null;
};

const MAX_LOGGED_CALLS = 200;

export const createHydraOAuth = ({ now }: { now: () => Date }) => {
    const usedCodes = new Map<string, number>();
    /** Each sign-in's newest refresh token, and whether a replay revoked it. */
    const families = new Map<
        string,
        { generation: number; revoked: boolean }
    >();
    const logs = new Map<string, HydraLoggedCall[]>();

    const forgetExpiredCodes = (time: number) => {
        usedCodes.forEach((usedAt, jti) => {
            if (usedAt + HYDRA_CODE_TTL_MS < time) usedCodes.delete(jti);
        });
    };

    const issueTokens = (
        settings: HydraSettings,
        claims: { sub: string; src: string; fam: string; gen: number },
    ): LiveHttpResponse => {
        families.set(claims.fam, { generation: claims.gen, revoked: false });
        const access: AccessClaims = {
            sub: claims.sub,
            src: claims.src,
            fam: claims.fam,
            exp: now().getTime() + settings.tokenTtlSeconds * 1_000,
        };
        const refresh: RefreshClaims = {
            sub: claims.sub,
            src: claims.src,
            fam: claims.fam,
            gen: claims.gen,
        };
        return json(200, {
            access_token: encode(ACCESS_PREFIX, { ...access, n: nonce() }),
            refresh_token: encode(REFRESH_PREFIX, { ...refresh, n: nonce() }),
            token_type: 'Bearer',
            expires_in: settings.tokenTtlSeconds,
        });
    };

    /**
     * Hydra's consent screen for `subject`: approves at once, or declines
     * when the settings say so. Malformed requests are refused without a
     * redirect, as the OAuth spec asks.
     */
    const authorize = ({
        sourceKey,
        settings,
        subject,
        params,
    }: {
        sourceKey: string;
        settings: HydraSettings;
        subject: string;
        params: HydraAuthorizeParams;
    }): HydraConsentAnswer => {
        if (params.client_id !== HYDRA_OAUTH_CLIENT_ID) {
            return { kind: 'invalid', message: 'Unknown client_id' };
        }
        let redirect: URL;
        try {
            redirect = new URL(params.redirect_uri ?? '');
        } catch {
            return { kind: 'invalid', message: 'redirect_uri must be a URL' };
        }
        const back = (values: Record<string, string>) => {
            const url = new URL(redirect.href);
            Object.entries({ ...values, state: params.state ?? '' }).forEach(
                ([key, value]) => url.searchParams.set(key, value),
            );
            return { kind: 'redirect' as const, location: url.href };
        };
        if (params.response_type !== 'code') {
            return back({ error: 'unsupported_response_type' });
        }
        if (!params.code_challenge || params.code_challenge_method !== 'S256') {
            return back({
                error: 'invalid_request',
                error_description: 'PKCE with S256 is required',
            });
        }
        if (settings.denyConsent || isRevoked(settings, subject)) {
            return back({ error: 'access_denied' });
        }
        const claims: CodeClaims = {
            sub: subject,
            src: sourceKey,
            cid: params.client_id,
            ruri: redirect.href,
            ch: params.code_challenge,
            iat: now().getTime(),
            jti: nonce(),
        };
        return back({ code: encode(CODE_PREFIX, claims) });
    };

    const exchangeCode = (
        sourceKey: string,
        settings: HydraSettings,
        form: URLSearchParams,
    ): LiveHttpResponse => {
        const claims = decode<CodeClaims>(CODE_PREFIX, form.get('code') ?? '');
        if (!claims) return oauthError(400, 'invalid_grant', 'Unknown code');
        const time = now().getTime();
        forgetExpiredCodes(time);
        if (usedCodes.has(claims.jti)) {
            return oauthError(
                400,
                'invalid_grant',
                'The code was already used',
            );
        }
        if (time - claims.iat > HYDRA_CODE_TTL_MS) {
            return oauthError(400, 'invalid_grant', 'The code expired');
        }
        if (claims.cid !== form.get('client_id')) {
            return oauthError(
                400,
                'invalid_grant',
                'The code was issued to another client',
            );
        }
        if (claims.ruri !== form.get('redirect_uri')) {
            return oauthError(
                400,
                'invalid_grant',
                'redirect_uri does not match the one the code was issued for',
            );
        }
        if (claims.src !== sourceKey) {
            return oauthError(
                400,
                'invalid_grant',
                'The code was issued for another source',
            );
        }
        const verifier = form.get('code_verifier') ?? '';
        const challenge = createHash('sha256')
            .update(verifier)
            .digest('base64url');
        if (challenge !== claims.ch) {
            return oauthError(
                400,
                'invalid_grant',
                'The code verifier does not match',
            );
        }
        usedCodes.set(claims.jti, time);
        if (isRevoked(settings, claims.sub)) {
            return oauthError(400, 'invalid_grant', 'The sign-in was revoked');
        }
        return issueTokens(settings, {
            sub: claims.sub,
            src: sourceKey,
            fam: nonce(),
            gen: 1,
        });
    };

    const refresh = (
        sourceKey: string,
        settings: HydraSettings,
        form: URLSearchParams,
    ): LiveHttpResponse => {
        const claims = decode<RefreshClaims>(
            REFRESH_PREFIX,
            form.get('refresh_token') ?? '',
        );
        if (!claims) {
            return oauthError(400, 'invalid_grant', 'Unknown refresh token');
        }
        if (claims.src !== sourceKey) {
            return oauthError(
                400,
                'invalid_grant',
                'The refresh token was issued for another source',
            );
        }
        if (isRevoked(settings, claims.sub)) {
            return oauthError(400, 'invalid_grant', 'The sign-in was revoked');
        }
        const family = families.get(claims.fam);
        if (family?.revoked) {
            return oauthError(400, 'invalid_grant', 'The sign-in was revoked');
        }
        if (family && claims.gen < family.generation) {
            // A rotated token came back: someone else may hold it
            family.revoked = true;
            return oauthError(
                400,
                'invalid_grant',
                'The refresh token was already used; the sign-in is revoked',
            );
        }
        return issueTokens(settings, { ...claims, gen: claims.gen + 1 });
    };

    /** Hydra's token endpoint, for a source's own client. */
    const token = ({
        sourceKey,
        settings,
        form,
    }: {
        sourceKey: string;
        settings: HydraSettings;
        form: URLSearchParams;
    }): LiveHttpResponse => {
        if (
            form.get('client_id') !== HYDRA_OAUTH_CLIENT_ID ||
            form.get('client_secret') !== HYDRA_OAUTH_CLIENT_SECRET
        ) {
            return oauthError(401, 'invalid_client', 'Unknown client');
        }
        switch (form.get('grant_type')) {
            case 'authorization_code':
                return exchangeCode(sourceKey, settings, form);
            case 'refresh_token':
                return refresh(sourceKey, settings, form);
            default:
                return oauthError(
                    400,
                    'unsupported_grant_type',
                    'Use authorization_code or refresh_token',
                );
        }
    };

    /**
     * Who a call signs in as. A viewer's access token reads that viewer's
     * rows while it is valid for this source; any other token is a shared
     * sign-in that seeds its own rows.
     */
    const identify = (
        sourceKey: string,
        settings: HydraSettings,
        accessToken: string,
    ): HydraIdentity => {
        if (!accessToken.startsWith(`${ACCESS_PREFIX}.`)) {
            return { kind: 'shared', seed: accessToken };
        }
        const claims = decode<AccessClaims>(ACCESS_PREFIX, accessToken);
        if (!claims) {
            return { kind: 'rejected', message: 'The token is malformed' };
        }
        if (claims.src !== sourceKey) {
            return {
                kind: 'rejected',
                message: 'The token was issued for another source',
            };
        }
        if (
            isRevoked(settings, claims.sub) ||
            families.get(claims.fam)?.revoked
        ) {
            return { kind: 'rejected', message: 'The sign-in was revoked' };
        }
        if (claims.exp <= now().getTime()) {
            return { kind: 'rejected', message: 'The token expired' };
        }
        return {
            kind: 'viewer',
            subject: claims.sub,
            seed: `viewer:${claims.sub}`,
        };
    };

    /** The scopes a viewer lacks for this call; empty when it may go ahead. */
    const getMissingScopes = (
        settings: HydraSettings,
        identity: HydraIdentity,
        request: Pick<LiveHttpRequest, 'method' | 'path' | 'body'>,
        reportPath: string,
    ): HydraScope[] => {
        if (identity.kind !== 'viewer') return [];
        const granted = settings.viewerScopes[identity.subject];
        if (!granted) return [];
        return getRequiredScopes(request, reportPath).filter(
            (scope) => !granted.includes(scope),
        );
    };

    const log = (sourceKey: string, call: HydraLoggedCall) => {
        const calls = logs.get(sourceKey) ?? [];
        calls.push(call);
        if (calls.length > MAX_LOGGED_CALLS) calls.shift();
        logs.set(sourceKey, calls);
    };

    return {
        authorize,
        token,
        identify,
        getMissingScopes,
        log,
        getLog: (sourceKey: string): HydraLoggedCall[] =>
            structuredClone(logs.get(sourceKey) ?? []),
        reset: (sourceKey?: string) => {
            if (sourceKey === undefined) {
                logs.clear();
                usedCodes.clear();
                families.clear();
            } else {
                logs.delete(sourceKey);
            }
        },
    };
};
