import { type LightdashConfig } from './parseConfig';

export const getSnowflakeAgentMissingSettings = (
    config: LightdashConfig,
): string[] =>
    config.license.licenseKey == null ? ['Enterprise licence'] : [];

export const isSnowflakeAgentConfigured = (config: LightdashConfig): boolean =>
    getSnowflakeAgentMissingSettings(config).length === 0;
