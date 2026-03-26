import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';

const PREVIEW_TOKEN_TYPE = 'app-preview';
const PREVIEW_TOKEN_MAX_AGE_SECONDS = 3600; // 1 hour
const PREVIEW_TOKEN_ISSUER = 'lightdash';
const PREVIEW_TOKEN_AUDIENCE = 'app-preview';

export { PREVIEW_TOKEN_MAX_AGE_SECONDS };

export type PreviewTokenPayload = {
    type: typeof PREVIEW_TOKEN_TYPE;
    appUuid: string;
    versionUuid: string;
    userUuid: string;
    organizationUuid: string;
    projectUuid: string;
};

/**
 * Derives a purpose-specific signing key from the global lightdash secret.
 * This ensures preview tokens cannot be confused with session cookies or
 * other HMAC uses of the same root secret.
 */
export const deriveSigningKey = (lightdashSecret: string): Buffer =>
    createHmac('sha256', lightdashSecret).update('app-preview-token').digest();

/**
 * Mints a short-lived JWT for accessing a specific app version's preview
 * and authenticating SDK API calls.
 */
export const mintPreviewToken = (
    lightdashSecret: string,
    appUuid: string,
    versionUuid: string,
    userUuid: string,
    organizationUuid: string,
    projectUuid: string,
): string =>
    jwt.sign(
        {
            type: PREVIEW_TOKEN_TYPE,
            appUuid,
            versionUuid,
            userUuid,
            organizationUuid,
            projectUuid,
        } satisfies PreviewTokenPayload,
        deriveSigningKey(lightdashSecret),
        {
            expiresIn: PREVIEW_TOKEN_MAX_AGE_SECONDS,
            issuer: PREVIEW_TOKEN_ISSUER,
            audience: PREVIEW_TOKEN_AUDIENCE,
            algorithm: 'HS256',
        },
    );

type VerifySuccess = { ok: true; payload: PreviewTokenPayload };
type VerifyFailure = { ok: false; status: 401 | 403; message: string };
export type VerifyPreviewTokenResult = VerifySuccess | VerifyFailure;

/**
 * Verifies a preview JWT and checks that the appUuid and versionUuid match
 * the expected values. Returns a discriminated union so callers can decide
 * how to handle errors without coupling to HTTP.
 */
export const verifyPreviewToken = (
    token: string | undefined,
    lightdashSecret: string,
    appUuid: string,
    versionUuid: string,
): VerifyPreviewTokenResult => {
    if (!token) {
        return { ok: false, status: 401, message: 'Missing preview token' };
    }

    try {
        const decoded = jwt.verify(token, deriveSigningKey(lightdashSecret), {
            algorithms: ['HS256'],
            issuer: PREVIEW_TOKEN_ISSUER,
            audience: PREVIEW_TOKEN_AUDIENCE,
        });

        if (
            typeof decoded === 'string' ||
            decoded.type !== PREVIEW_TOKEN_TYPE ||
            decoded.appUuid !== appUuid ||
            decoded.versionUuid !== versionUuid
        ) {
            return {
                ok: false,
                status: 403,
                message: 'Invalid or expired preview token',
            };
        }

        return {
            ok: true,
            payload: decoded as PreviewTokenPayload,
        };
    } catch {
        return {
            ok: false,
            status: 403,
            message: 'Invalid or expired preview token',
        };
    }
};

/**
 * Verifies a preview JWT for API authentication. Unlike verifyPreviewToken,
 * this does not check appUuid/versionUuid against request params — it only
 * validates the JWT signature, issuer, audience, and token type.
 *
 * Used by the API key auth strategy as a fallback when PAT lookup fails.
 */
export const verifyPreviewApiToken = (
    token: string,
    lightdashSecret: string,
): VerifyPreviewTokenResult => {
    try {
        const decoded = jwt.verify(token, deriveSigningKey(lightdashSecret), {
            algorithms: ['HS256'],
            issuer: PREVIEW_TOKEN_ISSUER,
            audience: PREVIEW_TOKEN_AUDIENCE,
        });

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

        return {
            ok: true,
            payload: decoded as PreviewTokenPayload,
        };
    } catch {
        return {
            ok: false,
            status: 403,
            message: 'Invalid or expired preview token',
        };
    }
};
