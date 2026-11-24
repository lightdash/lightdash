import { ForbiddenError } from '@lightdash/common';
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { type LightdashSecrets } from '../../../config/parseConfig';

/** Request header that carries the token; kept off Authorization so API key and OAuth parsing never see it. */
export const CSV_UPLOAD_TOKEN_HEADER = 'x-lightdash-upload-token';

export const CSV_UPLOAD_TOKEN_MAX_AGE_SECONDS = 5 * 60;

const TOKEN_TYPE = 'csv-upload';
const TOKEN_ISSUER = 'lightdash';
const TOKEN_AUDIENCE = 'csv-upload';

const claimsSchema = z.object({
    type: z.literal(TOKEN_TYPE),
    projectUuid: z.string(),
    sourceUuid: z.string(),
    userUuid: z.string(),
    sizeBytes: z.number().int().positive(),
});

export type CsvUploadTokenClaims = Omit<z.infer<typeof claimsSchema>, 'type'>;

// Purpose-specific key, so this token can't be confused with other HMAC uses of the secret.
const deriveSigningKey = (lightdashSecret: string): Buffer =>
    createHmac('sha256', lightdashSecret).update('csv-upload-token').digest();

export const mintCsvUploadToken = (
    lightdashSecrets: LightdashSecrets,
    claims: CsvUploadTokenClaims,
): { token: string; expiresAt: Date } => {
    const token = jwt.sign(
        { type: TOKEN_TYPE, ...claims },
        deriveSigningKey(lightdashSecrets.active),
        {
            expiresIn: CSV_UPLOAD_TOKEN_MAX_AGE_SECONDS,
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE,
            algorithm: 'HS256',
        },
    );
    const { exp } = jwt.decode(token) as { exp: number };
    return { token, expiresAt: new Date(exp * 1000) };
};

/** Returns the claims, or throws when the token is missing, expired or not signed by a configured secret. */
export const verifyCsvUploadToken = (
    token: string | undefined,
    lightdashSecrets: LightdashSecrets,
): CsvUploadTokenClaims => {
    if (!token) {
        throw new ForbiddenError(
            `The ${CSV_UPLOAD_TOKEN_HEADER} header is required`,
        );
    }
    let expired = false;
    const claims = lightdashSecrets.all.reduce<CsvUploadTokenClaims | null>(
        (found, secret) => {
            if (found) return found;
            try {
                const decoded = claimsSchema.safeParse(
                    jwt.verify(token, deriveSigningKey(secret), {
                        algorithms: ['HS256'],
                        issuer: TOKEN_ISSUER,
                        audience: TOKEN_AUDIENCE,
                    }),
                );
                if (!decoded.success) return null;
                const { type: _type, ...rest } = decoded.data;
                return rest;
            } catch (error) {
                if (error instanceof jwt.TokenExpiredError) expired = true;
                return null;
            }
        },
        null,
    );
    if (claims) return claims;
    throw new ForbiddenError(
        expired
            ? 'This upload link has expired. Prepare the upload again.'
            : 'This upload link is not valid',
    );
};
