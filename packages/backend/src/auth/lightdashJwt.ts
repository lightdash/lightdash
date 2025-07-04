/* eslint-disable */
import {
    CreateEmbedJwt,
    EmbedJwtSchema,
    ForbiddenError,
    getErrorMessage,
    isDashboardUuidContent,
    ParameterError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    JsonWebTokenError,
    sign,
    TokenExpiredError,
    verify,
} from 'jsonwebtoken';
import { z } from 'zod';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

export const JWT_HEADER_NAME = 'lightdash-embed-token';

/**
 * Encodes JWT data into a token
 */
export function encodeLightdashJwt(
    jwtData: CreateEmbedJwt,
    encodedSecret: string | Buffer,
    expiresIn: string,
): string {
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const secret = encryptionUtil.decrypt(
        Buffer.isBuffer(encodedSecret)
            ? encodedSecret
            : Buffer.from(encodedSecret),
    );
    return sign(jwtData, secret, { expiresIn });
}

/**
 * Decodes and validates a Lightdash Embed JWT token
 */
export function decodeLightdashJwt(
    token: string,
    encodedSecret: string | Buffer,
): CreateEmbedJwt {
    try {
        const encryptionUtil = new EncryptionUtil({ lightdashConfig });
        const secret = encryptionUtil.decrypt(
            Buffer.isBuffer(encodedSecret)
                ? encodedSecret
                : Buffer.from(encodedSecret),
        );
        const decodedToken = verify(token, secret) as CreateEmbedJwt;

        // Alert if the token is not in the expected format so we can inform the org before enforcing validation
        try {
            EmbedJwtSchema.parse(decodedToken);
        } catch (e) {
            let errorIdentifier = 'unknown';
            if (decodedToken?.content) {
                if (isDashboardUuidContent(decodedToken.content)) {
                    errorIdentifier = decodedToken.content.dashboardUuid;
                } else if ('dashboardSlug' in decodedToken.content) {
                    errorIdentifier = decodedToken.content.dashboardSlug;
                }
            }
            // FIXME: This is legacy behavior where we simply log Zod schema validation errors.
            if (e instanceof z.ZodError) {
                const zodErrors = e.issues
                    .map((issue) => issue.message)
                    .join(', ');

                Logger.error(
                    `Token schema validation error: ${errorIdentifier}: ${zodErrors}`,
                );
            } else {
                Logger.error(
                    `Invalid embed token ${errorIdentifier}: ${getErrorMessage(
                        e,
                    )}`,
                );
            }
            Sentry.captureException(e);
        }
        return decodedToken;
    } catch (e) {
        if (e instanceof TokenExpiredError) {
            throw new ForbiddenError('Your embed token has expired.');
        }
        if (e instanceof JsonWebTokenError) {
            throw new ParameterError(`Invalid embed token: ${e.message}`);
        }
        if (e instanceof z.ZodError) {
            const zodErrors = e.issues.map((issue) => issue.message).join(', ');
            throw new ParameterError(
                `Token schema validation error: ${zodErrors}`,
            );
        }
        throw e;
    }
}
