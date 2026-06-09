/* eslint-disable */
import {
    CreateEmbedJwt,
    EmbedJwtSchema,
    ForbiddenError,
    isDashboardUuidContent,
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
        const validationResult = EmbedJwtSchema.safeParse(decodedToken);

        // Alert if the token is not in the expected format so we can inform the org before enforcing validation
        if (!validationResult.success) {
            let errorIdentifier = 'unknown';
            if (decodedToken?.content) {
                if (isDashboardUuidContent(decodedToken.content)) {
                    errorIdentifier = decodedToken.content.dashboardUuid;
                } else if ('dashboardSlug' in decodedToken.content) {
                    errorIdentifier = decodedToken.content.dashboardSlug;
                }
            }
            // FIXME: This is legacy behavior where we simply log Zod schema validation errors.
            const zodErrors = validationResult.error.issues
                .map((issue) => issue.message)
                .join(', ');

            Logger.error(
                `Token schema validation error: ${errorIdentifier}: ${zodErrors}`,
            );
            Sentry.captureException(validationResult.error);
            return decodedToken;
        }

        return validationResult.data as CreateEmbedJwt;
    } catch (e) {
        if (e instanceof TokenExpiredError) {
            throw new ForbiddenError('Your embed token has expired.');
        }
        if (e instanceof JsonWebTokenError) {
            throw new ForbiddenError(`Invalid embed token: ${e.message}`);
        }
        if (e instanceof z.ZodError) {
            const zodErrors = e.issues.map((issue) => issue.message).join(', ');
            throw new ForbiddenError(
                `Token schema validation error: ${zodErrors}`,
            );
        }
        throw e;
    }
}
