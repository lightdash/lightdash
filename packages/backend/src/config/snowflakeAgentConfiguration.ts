import { SNOWFLAKE_AGENT_OAUTH_SETTINGS } from '@lightdash/common';
import { URL } from 'url';
import { type LightdashConfig } from './parseConfig';

export const getSnowflakeAiAccount = (
    config: LightdashConfig['auth']['snowflakeAi'],
): string | null => {
    if (config.account) return config.account;
    if (!config.tokenEndpoint) return null;
    try {
        const host = new URL(config.tokenEndpoint).hostname.toLowerCase();
        const suffix = '.snowflakecomputing.com';
        return host.endsWith(suffix) ? host.slice(0, -suffix.length) : null;
    } catch {
        return null;
    }
};

export const getSnowflakeAgentMissingOAuthSettings = (
    config: LightdashConfig['auth']['snowflakeAi'],
): string[] => {
    const values = [
        config.clientId,
        config.clientSecret,
        config.authorizationEndpoint,
        config.tokenEndpoint,
    ];
    const missingSettings = SNOWFLAKE_AGENT_OAUTH_SETTINGS.filter(
        (_setting, index) => !values[index],
    ).map(({ envVar }) => envVar);
    return missingSettings.length === 0 && !getSnowflakeAiAccount(config)
        ? ['SNOWFLAKE_AI_OAUTH_ACCOUNT']
        : missingSettings;
};

export const getSnowflakeAgentMissingSettings = (
    config: LightdashConfig,
): string[] => [
    ...getSnowflakeAgentMissingOAuthSettings(config.auth.snowflakeAi),
    ...(config.license.licenseKey === undefined ? ['Enterprise licence'] : []),
];

export const isSnowflakeAgentConfigured = (config: LightdashConfig): boolean =>
    getSnowflakeAgentMissingSettings(config).length === 0;
