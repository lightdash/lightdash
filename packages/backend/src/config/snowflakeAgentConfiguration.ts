import { SNOWFLAKE_AGENT_OAUTH_SETTINGS } from '@lightdash/common';
import { type LightdashConfig } from './parseConfig';

export const getSnowflakeAgentMissingOAuthSettings = (
    config: LightdashConfig['auth']['snowflakeAi'],
): string[] => {
    const values = [
        config.clientId,
        config.clientSecret,
        config.authorizationEndpoint,
        config.tokenEndpoint,
    ];
    return SNOWFLAKE_AGENT_OAUTH_SETTINGS.filter(
        (_setting, index) => !values[index],
    ).map(({ envVar }) => envVar);
};

export const getSnowflakeAgentMissingSettings = (
    config: LightdashConfig,
): string[] => [
    ...getSnowflakeAgentMissingOAuthSettings(config.auth.snowflakeAi),
    ...(config.license.licenseKey === undefined ? ['Enterprise licence'] : []),
];

export const isSnowflakeAgentConfigured = (config: LightdashConfig): boolean =>
    getSnowflakeAgentMissingSettings(config).length === 0;
