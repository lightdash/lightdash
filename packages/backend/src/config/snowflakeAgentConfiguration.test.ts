import { describe, expect, it } from 'vitest';
import { lightdashConfigMock } from './lightdashConfig.mock';
import { type LightdashConfig } from './parseConfig';
import {
    getSnowflakeAgentMissingSettings,
    getSnowflakeAiAccount,
    isSnowflakeAgentConfigured,
} from './snowflakeAgentConfiguration';

const snowflakeAi: LightdashConfig['auth']['snowflakeAi'] = {
    ...lightdashConfigMock.auth.snowflakeAi,
    account: undefined,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    authorizationEndpoint: 'https://proxy.example/authorize',
    tokenEndpoint: 'https://proxy.example/token',
};

describe('Snowflake agent configuration', () => {
    it.each([
        [undefined, 'https://proxy.example/token', null],
        ['explicit-account', 'https://proxy.example/token', 'explicit-account'],
        [
            'explicit-account',
            'https://derived.snowflakecomputing.com/token',
            'explicit-account',
        ],
        [
            undefined,
            'https://ACCOUNT.REGION.snowflakecomputing.com/oauth/token-request',
            'account.region',
        ],
        [
            undefined,
            'https://account.snowflakecomputing.com.evil.example/token',
            null,
        ],
        [undefined, 'https://snowflakecomputing.com/token', null],
        [undefined, 'invalid-url', null],
        [undefined, undefined, null],
    ])(
        'resolves account %s from endpoint %s as %s',
        (account, tokenEndpoint, expected) => {
            expect(
                getSnowflakeAiAccount({
                    ...snowflakeAi,
                    account,
                    tokenEndpoint,
                }),
            ).toBe(expected);
        },
    );

    it.each([undefined, 'explicit-account'])(
        'requires an explicit account for a proxy endpoint (%s)',
        (account) => {
            const config: LightdashConfig = {
                ...lightdashConfigMock,
                license: {
                    ...lightdashConfigMock.license,
                    licenseKey: 'test-license',
                },
                auth: {
                    ...lightdashConfigMock.auth,
                    snowflakeAi: { ...snowflakeAi, account },
                },
            };
            expect(getSnowflakeAgentMissingSettings(config)).toEqual(
                account ? [] : ['SNOWFLAKE_AI_OAUTH_ACCOUNT'],
            );
            expect(isSnowflakeAgentConfigured(config)).toBe(Boolean(account));
        },
    );
});
