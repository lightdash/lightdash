/* eslint-disable */
import {
    CreateEmbedJwt,
    EmbedJwtSchema,
    EmbedSourceSpaceUuidsSchema,
    EmbedWriteSpaceUuidsSchema,
    ForbiddenError,
    getErrorMessage,
    isDashboardUuidContent,
    normalizeEmbedJwt,
    ParameterInteractivityOptionsSchema,
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
        const verifiedToken = verify(token, secret) as CreateEmbedJwt;
        const decodedToken = normalizeEmbedJwt(verifiedToken);

        // Unknown authorization modes must not fall back to default permissions.
        if (
            decodedToken.content?.type === 'aiAgent' ||
            decodedToken.content?.type === 'dashboard'
        ) {
            z.enum(['default', 'roles'])
                .optional()
                .parse(decodedToken.writeActions?.permissionsMode);
        }

        // EmbedJwtSchema below only logs failures, so this authorization claim is enforced here.
        EmbedSourceSpaceUuidsSchema.optional().parse(
            decodedToken.writeActions?.sourceSpaceUuids,
        );
        EmbedWriteSpaceUuidsSchema.optional().parse(
            decodedToken.writeActions?.writeSpaceUuids,
        );
        if (
            decodedToken.writeActions?.spaceUuid !== undefined &&
            decodedToken.writeActions.writeSpaceUuids !== undefined
        ) {
            throw new ForbiddenError(
                'Use either writeSpaceUuids or the deprecated spaceUuid, not both',
            );
        }

        // Parameter rules are authorization claims too; `enabled` stays log-only for legacy tokens.
        const parameterInteractivity =
            decodedToken.content &&
            'parameterInteractivity' in decodedToken.content
                ? decodedToken.content.parameterInteractivity
                : undefined;
        if (parameterInteractivity) {
            ParameterInteractivityOptionsSchema.pick({
                allowedParameters: true,
                hidden: true,
                values: true,
            }).parse({
                allowedParameters: parameterInteractivity.allowedParameters,
                hidden: parameterInteractivity.hidden,
                values: parameterInteractivity.values,
            });
        }

        // Alert if the token is not in the expected format so we can inform the org before enforcing validation
        try {
            EmbedJwtSchema.parse(verifiedToken);
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
