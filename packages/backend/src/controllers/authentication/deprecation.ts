import { DeprecatedRouteError } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { RequestHandler } from 'express';
import Logger from '../../logging/logger';

const SUNSET_MONTHS_FROM_DEPRECATION = 3;
const ERROR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const getDefaultSunsetDate = (deprecatedOn: Date): Date => {
    const sunset = new Date(deprecatedOn);
    sunset.setMonth(sunset.getMonth() + SUNSET_MONTHS_FROM_DEPRECATION);
    return sunset;
};

export const shouldEscalateToError = (removeOn: Date, now: Date): boolean =>
    removeOn.getTime() - now.getTime() <= ERROR_WINDOW_MS;

type DeprecatedRouteOptions = {
    removeOn?: Date;
    suffixMessage?: string;
};

/**
 * Handles a deprecated API route: sets deprecation response headers and logs
 * every call. Logs escalate from warn to error once the removal date is within
 * two weeks or has passed.
 * @param deprecatedOn - The date the endpoint was deprecated
 * @param options.removeOn - Removal date (defaults to deprecatedOn + 3 months)
 * @param options.suffixMessage - Replacement hint appended to logs and headers
 */
export const getDeprecatedRouteMiddleware = (
    deprecatedOn: Date,
    options?: DeprecatedRouteOptions,
): RequestHandler => {
    const removeOn = options?.removeOn ?? getDefaultSunsetDate(deprecatedOn);
    const suffix = options?.suffixMessage ? ` ${options.suffixMessage}` : '';

    return (req, res, next) => {
        res.setHeader('Deprecation', deprecatedOn.toUTCString());
        res.setHeader('Sunset', removeOn.toUTCString());
        res.setHeader(
            'Warning',
            `299 - "This API endpoint is deprecated and will be removed after ${removeOn.toUTCString()}.${suffix}"`,
        );

        const message = `Deprecated endpoint called: ${req.method} ${req.path} (deprecated ${deprecatedOn.toISOString()}, removal ${removeOn.toISOString()}).${suffix}`;
        if (shouldEscalateToError(removeOn, new Date())) {
            Logger.error(message);
            Sentry.captureException(
                new DeprecatedRouteError(message, {
                    method: req.method,
                    path: req.path,
                    deprecatedOn: deprecatedOn.toISOString(),
                    removeOn: removeOn.toISOString(),
                }),
            );
        } else {
            Logger.warn(message);
        }

        next();
    };
};

export const deprecatedResultsRoute: RequestHandler =
    getDeprecatedRouteMiddleware(new Date('2025-03-20'), {
        removeOn: new Date('2025-04-30'),
        suffixMessage: `Please use 'POST /api/v2/projects/{projectUuid}/query' in conjuntion with 'GET /api/v2/projects/{projectUuid}/query/{queryUuid}' instead.`,
    });
