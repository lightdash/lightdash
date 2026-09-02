import { RequestHandler } from 'express';
import Logger from '../../logging/logger';

const SUNSET_MONTHS_FROM_DEPRECATION = 3;

export const getDefaultSunsetDate = (deprecatedOn: Date): Date => {
    const sunset = new Date(deprecatedOn);
    sunset.setUTCMonth(sunset.getUTCMonth() + SUNSET_MONTHS_FROM_DEPRECATION);
    return sunset;
};

type DeprecatedRouteOptions = {
    removeOn?: Date;
    suffixMessage?: string;
};

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

        Logger.warn(`Deprecated endpoint called.${suffix}`, {
            route: `${req.method} ${req.path}`,
            deprecatedOn: deprecatedOn.toISOString(),
            removeOn: removeOn.toISOString(),
        });

        next();
    };
};

export const deprecatedResultsRoute: RequestHandler =
    getDeprecatedRouteMiddleware(new Date('2025-03-20'), {
        removeOn: new Date('2025-04-30'),
        suffixMessage: `Please use 'POST /api/v2/projects/{projectUuid}/query' in conjunction with 'GET /api/v2/projects/{projectUuid}/query/{queryUuid}' instead.`,
    });
