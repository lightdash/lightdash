import {
    CreateEmbedJwt,
    EmbedJwt,
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
): EmbedJwt {
    try {
        const encryptionUtil = new EncryptionUtil({ lightdashConfig });
        const secret = encryptionUtil.decrypt(
            Buffer.isBuffer(encodedSecret)
                ? encodedSecret
                : Buffer.from(encodedSecret),
        );
        const decodedToken = verify(token, secret) as unknown as EmbedJwt;

        // Alert if the token is not in the expected format so we can inform the org before enforcing validation
        try {
            // Type assertion for the schema parse method
            (EmbedJwtSchema as z.ZodSchema<EmbedJwt>).parse(decodedToken);
        } catch (e) {
            let errorIdentifier = 'unknown';
            // Type guard to ensure decodedToken has the expected structure
            if (
                decodedToken &&
                typeof decodedToken === 'object' &&
                'content' in decodedToken
            ) {
                const content =
                    decodedToken.content as CreateEmbedJwt['content'];
                if (isDashboardUuidContent(content)) {
                    errorIdentifier = content.dashboardUuid;
                } else if (
                    typeof content === 'object' &&
                    content !== null &&
                    'dashboardSlug' in content
                ) {
                    errorIdentifier = (content as { dashboardSlug: string })
                        .dashboardSlug;
                }
            }
            // FIXME: This needs to be cleaned up. Need to verify current behavior
            if (e instanceof z.ZodError) {
                const zodErrors = e.issues
                    .map((issue) => issue.message)
                    .join(', ');

                Logger.error(
                    `Invalid embed token ${errorIdentifier}: ${zodErrors}`,
                );
            } else {
                Logger.error(
                    `Invalid embed token ${errorIdentifier}: ${getErrorMessage(
                        e as Error,
                    )}`,
                );
            }
            Sentry.captureException(e);
            if (e instanceof z.ZodError) {
                const zodErrors = e.issues
                    .map((issue) => issue.message)
                    .join(', ');
                throw new ParameterError(`Invalid embed token: ${zodErrors}`);
            }
            throw e;
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
            throw new ParameterError(`Invalid embed token: ${zodErrors}`);
        }
        throw e;
    }
}
