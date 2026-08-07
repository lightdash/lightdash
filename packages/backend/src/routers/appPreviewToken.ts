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
): string =>
    jwt.sign(
        {
            type: PREVIEW_TOKEN_TYPE,
            appUuid,
            version,
            userUuid,
            organizationUuid,
            projectUuid,
        } satisfies PreviewTokenPayload,
        deriveSigningKey(lightdashSecrets.active),
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
    if (!token) {
        return { ok: false, status: 401, message: 'Missing preview token' };
    }

    // Tokens are minted with the active secret only; fallback candidates keep
    // tokens issued before a secret rotation valid until they expire.
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
                decoded.type !== PREVIEW_TOKEN_TYPE ||
                decoded.appUuid !== appUuid ||
                decoded.version !== version
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
            // try the next candidate secret
        }
    }
    return {
        ok: false,
        status: 403,
        message: 'Invalid or expired preview token',
    };
};
