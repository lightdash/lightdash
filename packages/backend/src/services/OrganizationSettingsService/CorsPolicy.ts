import {
    getCorsWildcardOriginRegexSource,
    isCorsWildcardOrigin,
} from '@lightdash/common';
import { Request } from 'express';
import { type LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { type OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';

const CORS_POLICY_CACHE_TTL_MS = 60_000;

type CorsOptions = {
    methods: string;
    allowedHeaders: string;
    credentials: boolean;
    origin: Array<string | RegExp> | false;
};

const createCorsOptions = (origin: CorsOptions['origin']): CorsOptions => ({
    methods: 'OPTIONS, GET, HEAD, PUT, PATCH, POST, DELETE',
    allowedHeaders: '*',
    credentials: false,
    origin,
});

type CorsOptionsDelegate = (
    req: Request,
    callback: (err: Error | null, options?: CorsOptions) => void,
) => void;

let cachedAllowedOrigins: Array<string | RegExp> | undefined;
let cachedUntil = 0;
let refreshPromise: Promise<Array<string | RegExp>> | undefined;

export const invalidateCorsPolicyCache = () => {
    cachedAllowedOrigins = undefined;
    cachedUntil = 0;
    refreshPromise = undefined;
};

export const compileCorsAllowedDomain = (
    allowedDomain: string,
): string | RegExp | undefined => {
    if (allowedDomain.startsWith('/') && allowedDomain.endsWith('/')) {
        try {
            return new RegExp(allowedDomain.slice(1, -1));
        } catch (error) {
            Logger.warn('Ignoring invalid CORS regex pattern', {
                allowedDomain,
                error,
            });
            return undefined;
        }
    }
    if (isCorsWildcardOrigin(allowedDomain)) {
        const regexSource = getCorsWildcardOriginRegexSource(allowedDomain);
        return regexSource ? new RegExp(regexSource) : undefined;
    }
    return allowedDomain;
};

const dedupeOrigins = (
    origins: Array<string | RegExp>,
): Array<string | RegExp> => {
    const seen = new Set<string>();
    return origins.filter((origin) => {
        const key =
            typeof origin === 'string'
                ? `string:${origin}`
                : `regex:${origin.toString()}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const compileAllowedDomains = (
    allowedDomains: string[],
    source: 'instance' | 'organization',
): Array<string | RegExp> =>
    allowedDomains.flatMap((allowedDomain) => {
        try {
            const compiled = compileCorsAllowedDomain(allowedDomain);
            return compiled ? [compiled] : [];
        } catch (error) {
            Logger.warn('Ignoring invalid CORS allowed domain', {
                allowedDomain,
                source,
                error,
            });
            return [];
        }
    });

const buildInstanceAllowedOrigins = (
    lightdashConfig: LightdashConfig,
): Array<string | RegExp> => {
    if (!lightdashConfig.security.crossOriginResourceSharingPolicy.enabled) {
        return [];
    }

    return dedupeOrigins(
        compileAllowedDomains(
            [
                lightdashConfig.siteUrl,
                ...lightdashConfig.security.crossOriginResourceSharingPolicy
                    .allowedDomains,
            ],
            'instance',
        ),
    );
};

const buildAllowedOrigins = async ({
    lightdashConfig,
    organizationSettingsModel,
}: {
    lightdashConfig: LightdashConfig;
    organizationSettingsModel: OrganizationSettingsModel;
}): Promise<Array<string | RegExp>> => {
    if (!lightdashConfig.security.crossOriginResourceSharingPolicy.enabled) {
        return [];
    }

    const instanceAllowedOrigins = buildInstanceAllowedOrigins(lightdashConfig);

    let dbAllowedDomains: string[] = [];
    try {
        dbAllowedDomains =
            await organizationSettingsModel.getAllEnabledCorsAllowedDomains();
    } catch (error) {
        Logger.warn(
            'Could not load organization CORS settings; using instance CORS settings only',
            { error },
        );
        return instanceAllowedOrigins;
    }

    return dedupeOrigins([
        ...instanceAllowedOrigins,
        ...compileAllowedDomains(dbAllowedDomains, 'organization'),
    ]);
};

const getAllowedOrigins = async (args: {
    lightdashConfig: LightdashConfig;
    organizationSettingsModel: OrganizationSettingsModel;
}): Promise<Array<string | RegExp>> => {
    const now = Date.now();
    if (cachedAllowedOrigins && cachedUntil > now) {
        return cachedAllowedOrigins;
    }

    refreshPromise ??= buildAllowedOrigins(args);
    cachedAllowedOrigins = await refreshPromise;
    cachedUntil = now + CORS_POLICY_CACHE_TTL_MS;
    refreshPromise = undefined;
    return cachedAllowedOrigins;
};

export const createCorsOptionsDelegate =
    (args: {
        lightdashConfig: LightdashConfig;
        organizationSettingsModel: OrganizationSettingsModel;
    }): CorsOptionsDelegate =>
    (req, callback) => {
        if (!req.headers.origin) {
            callback(null, createCorsOptions(false));
            return;
        }

        getAllowedOrigins(args)
            .then((allowedOrigins) => {
                callback(null, createCorsOptions(allowedOrigins));
            })
            .catch((error) => {
                Logger.warn(
                    'Could not build CORS policy; using instance CORS settings only',
                    { error },
                );
                callback(
                    null,
                    createCorsOptions(
                        buildInstanceAllowedOrigins(args.lightdashConfig),
                    ),
                );
            });
    };
