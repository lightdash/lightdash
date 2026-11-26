import {
    ApiConnectorType,
    getSupabaseKeyError,
    ParameterError,
    type ExternalConnectionApiSource,
    type ExternalConnectionAuthType,
} from '@lightdash/common';
import {
    getLiveAccessRules,
    validateLiveConnection,
} from '../../../services/QuerySourceService/live/integration';
import { getLiveIntegration } from '../../../services/QuerySourceService/live/registry';

/**
 * Api source connections reach only their integration's query and metadata
 * endpoints, whatever access rules the request carries or the stored
 * connection has.
 */
export const withApiSourceAccessRules = <
    T extends { apiSource?: ExternalConnectionApiSource | null },
>(
    config: T,
): T =>
    config.apiSource
        ? {
              ...config,
              ...getLiveAccessRules(
                  getLiveIntegration(config.apiSource.connector),
                  config.apiSource,
              ),
          }
        : config;

/** Refuses a Supabase key that would scan nothing or read no rows */
export const assertSupabaseKey = (
    apiSource: ExternalConnectionApiSource | null | undefined,
    secret: string | null | undefined,
): void => {
    if (apiSource?.connector !== ApiConnectorType.SUPABASE || !secret) return;
    const error = getSupabaseKeyError(secret);
    if (error) throw new ParameterError(error);
};

export const validateApiSourceConnection = ({
    apiSource,
    type,
    origin,
    oauthTokenUrl,
    secret,
}: {
    apiSource?: ExternalConnectionApiSource | null;
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
    secret?: string | null;
}): void => {
    if (!apiSource) {
        if (type === 'oauth_authorization_code') {
            throw new ParameterError(
                'Only live data sources can sign in with OAuth',
            );
        }
        return;
    }
    validateLiveConnection(getLiveIntegration(apiSource.connector), {
        apiSource,
        type,
        origin,
        oauthTokenUrl,
    });
    assertSupabaseKey(apiSource, secret);
};
