import { describe, expect, it } from 'vitest';
import { lightdashConfigMock } from './lightdashConfig.mock';
import {
    getSnowflakeAgentMissingSettings,
    isSnowflakeAgentConfigured,
} from './snowflakeAgentConfiguration';

describe('Snowflake agent configuration', () => {
    it.each([null, 'test-license'])(
        'requires only an Enterprise licence (%s)',
        (licenseKey) => {
            const config = {
                ...lightdashConfigMock,
                license: { ...lightdashConfigMock.license, licenseKey },
            };
            expect(getSnowflakeAgentMissingSettings(config)).toEqual(
                licenseKey === null ? ['Enterprise licence'] : [],
            );
            expect(isSnowflakeAgentConfigured(config)).toBe(
                licenseKey !== null,
            );
        },
    );
});
