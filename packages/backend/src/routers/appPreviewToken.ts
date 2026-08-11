import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { LightdashSecrets } from '../config/parseConfig';

const PREVIEW_TOKEN_TYPE = 'app-preview';
const PREVIEW_TOKEN_MAX_AGE_SECONDS = 3600; // 1 hour
const PREVIEW_TOKEN_ISSUER = 'lightdash';
const PREVIEW_TOKEN_AUDIENCE = 'app-preview';

export type PreviewTokenPayload = {
    type: typeof PREVIEW_TOKEN_TYPE;
    appUuid: string;
    version: number;
    userUuid: string;
    organizationUuid: string;
    projectUuid: string;
    /** Exact public HTTPS origins admitted to this app's img-src policy. */
    browserImageOrigins: string[];
};

const normalizeBrowserImageOrigins = (origins: unknown): string[] | null => {
    if (origins === undefined) return [];
    if (!Array.isArray(origins) || origins.length > 20) return null;

    const normalized = origins.map((origin) => {
        if (typeof origin !== 'string') return null;
        try {
            const url = new URL(origin);
            if (
                url.protocol !== 'https:' ||
                url.username ||
                url.password ||
                (url.pathname && url.pathname !== '/') ||
                url.search ||
                url.hash
            ) {
                return null;
            }
            return url.origin;
        } catch {
            return null;
        }
    });
    if (normalized.some((origin) => origin === null)) return null;
    return [...new Set(normalized as string[])].sort();
};

/**
 * Derives a purpose-specific signing key from the global lightdash secret.
 * This ensures preview tokens cannot be confused with session cookies or
 * other HMAC uses of the same root secret.
 */
export const deriveSigningKey = (lightdashSecret: string): Buffer =>
    createHmac('sha256', lightdashSecret).update('app-preview-token').digest();

/**
 * Mints a short-lived JWT for accessing a specific app version's preview.
 */
export const mintPreviewToken = (
    lightdashSecrets: LightdashSecrets,
    appUuid: string,
    version: number,
    userUuid: string,
    organizationUuid: string,
    projectUuid: string,
    browserImageOrigins: string[] = [],
): string => {
    const normalizedOrigins = normalizeBrowserImageOrigins(browserImageOrigins);
    if (!normalizedOrigins) {
        throw new Error('Invalid browser image origin');
    }

    return jwt.sign(
        {
            type: PREVIEW_TOKEN_TYPE,
            appUuid,
            version,
            userUuid,
            organizationUuid,
            projectUuid,
            browserImageOrigins: normalizedOrigins,
        } satisfies PreviewTokenPayload,
        deriveSigningKey(lightdashSecrets.active),
        {
            expiresIn: PREVIEW_TOKEN_MAX_AGE_SECONDS,
            issuer: PREVIEW_TOKEN_ISSUER,
            audience: PREVIEW_TOKEN_AUDIENCE,
            algorithm: 'HS256',
        },
    );
};

type VerifySuccess = { ok: true; payload: PreviewTokenPayload };
type VerifyFailure = { ok: false; status: 401 | 403; message: string };
export type VerifyPreviewTokenResult = VerifySuccess | VerifyFailure;

export const verifyPreviewTokenClaims = (
    token: string | undefined,
    lightdashSecrets: LightdashSecrets,
): VerifyPreviewTokenResult => {
    if (!token) {
        return { ok: false, status: 401, message: 'Missing preview token' };
    }

    for (const candidateSecret of lightdashSecrets.all) {
        try {
            const decoded = jwt.verify(
                token,
                deriveSigningKey(candidateSecret),
                {
                    algorithms: ['HS256'],
                    issuer: PREVIEW_TOKEN_ISSUER,
                    audience: PREVIEW_TOKEN_AUDIENCE,
                },
            );
            if (
                typeof decoded === 'string' ||
                decoded.type !== PREVIEW_TOKEN_TYPE
            ) {
                return {
                    ok: false,
                    status: 403,
                    message: 'Invalid or expired preview token',
                };
            }
            const browserImageOrigins = normalizeBrowserImageOrigins(
                decoded.browserImageOrigins,
            );
            if (!browserImageOrigins) {
                return {
                    ok: false,
                    status: 403,
                    message: 'Invalid or expired preview token',
                };
            }
            return {
                ok: true,
                payload: {
                    ...(decoded as Omit<
                        PreviewTokenPayload,
                        'browserImageOrigins'
                    >),
                    browserImageOrigins,
                },
            };
        } catch {
            // Try the next candidate during secret rotation.
        }
    }
    return {
        ok: false,
        status: 403,
        message: 'Invalid or expired preview token',
    };
};

/**
 * Verifies a preview JWT and checks that the appUuid and version match
 * the expected values. Returns a discriminated union so callers can decide
 * how to handle errors without coupling to HTTP.
 */
export const verifyPreviewToken = (
    token: string | undefined,
    lightdashSecrets: LightdashSecrets,
    appUuid: string,
    version: number,
): VerifyPreviewTokenResult => {
    const result = verifyPreviewTokenClaims(token, lightdashSecrets);
    if (
        !result.ok ||
        (result.payload.appUuid === appUuid &&
            result.payload.version === version)
    ) {
        return result;
    }
    return {
        ok: false,
        status: 403,
        message: 'Invalid or expired preview token',
    };
};
