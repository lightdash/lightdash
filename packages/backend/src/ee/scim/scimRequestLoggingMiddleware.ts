import { getErrorMessage } from '@lightdash/common';
import { RequestHandler, Response } from 'express';
import Logger from '../../logging/logger';
import { ScimService } from '../services/ScimService/ScimService';
import { extractScimRequestLog } from './extractScimRequestLog';

/**
 * Captures every attributable SCIM v2 request into the org's request log.
 * Log writes are fire-and-forget: a logging failure must never fail or
 * delay a SCIM request.
 */
export const scimRequestLoggingMiddleware: RequestHandler = (
    req,
    res,
    next,
) => {
    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
        responseBody = body;
        return originalJson(body);
    };

    res.on('finish', () => {
        try {
            // Attributable = passed SCIM auth, or resolved-but-expired token.
            // Garbage-token 401s and unauthenticated discovery are skipped.
            const attribution = req.serviceAccount
                ? {
                      organizationUuid: req.serviceAccount.organizationUuid,
                      serviceAccountUuid: req.serviceAccount.uuid,
                  }
                : req.scimLogAttribution;
            if (!attribution) return;

            const record = extractScimRequestLog({
                method: req.method,
                originalUrl: req.originalUrl,
                requestBody: req.body,
                responseStatus: res.statusCode,
                responseBody,
            });

            req.services
                .getScimService<ScimService>()
                .createRequestLog({ ...record, ...attribution })
                .catch((error) => {
                    Logger.warn('Failed to write SCIM request log', {
                        error: getErrorMessage(error),
                    });
                });
        } catch (error) {
            Logger.warn('Failed to write SCIM request log', {
                error: getErrorMessage(error),
            });
        }
    });

    next();
};
