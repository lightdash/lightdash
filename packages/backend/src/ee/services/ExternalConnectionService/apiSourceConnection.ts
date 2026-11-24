import {
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

export const validateApiSourceConnection = ({
    apiSource,
    type,
    origin,
    oauthTokenUrl,
}: {
    apiSource?: ExternalConnectionApiSource | null;
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
}): void => {
    if (!apiSource) {
        if (type === 'oauth_authorization_code') {
            throw new ParameterError(
                'Only live data sources can sign in with OAuth',
            );
        }
        if (type === 'app_store_connect_key') {
            throw new ParameterError(
                'Only live data sources can use an App Store Connect key',
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
};
