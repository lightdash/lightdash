import {
    ParameterError,
    type ExternalConnectionApiSource,
    type ExternalConnectionAuthType,
} from '@lightdash/common';
import { getApiSourceIntegration } from '../../../services/QuerySourceService/api/apiSourceIntegrations';

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
              ...getApiSourceIntegration(
                  config.apiSource.connector,
              ).getAccessRules(config.apiSource),
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
        return;
    }
    getApiSourceIntegration(apiSource.connector).validateConnection({
        apiSource,
        type,
        origin,
        oauthTokenUrl,
    });
};
