import { AnyType } from '@lightdash/common';
import { Request } from 'express';

// snowflakeStrategy reads the lightdashConfig singleton; mock it with the
// snowflake OAuth env config set so the strategy is constructed.
vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } = await vi.importActual<
        typeof import('../../../config/lightdashConfig.mock')
    >('../../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://test.lightdash.cloud',
            auth: {
                ...lightdashConfigMock.auth,
                snowflake: {
                    ...lightdashConfigMock.auth.snowflake,
                    authorizationEndpoint:
                        'https://acme.snowflakecomputing.com/oauth/authorize',
                    tokenEndpoint:
                        'https://acme.snowflakecomputing.com/oauth/token-request',
                    clientId: 'snowflake-client-id',
                    clientSecret: 'snowflake-client-secret',
                },
            },
        },
    };
});

// eslint-disable-next-line import/first
import { snowflakePassportStrategy } from './snowflakeStrategy';

const sessionStateKey = 'oauth2:acme.snowflakecomputing.com';

describe('snowflakePassportStrategy', () => {
    it('is constructed when snowflake oauth is configured', () => {
        expect(snowflakePassportStrategy).toBeDefined();
    });

    it('issues a state parameter and persists it in the session', () => {
        const strategy = snowflakePassportStrategy!;
        const req = { session: {}, query: {} } as unknown as Request;

        let redirectUrl: string | undefined;
        (strategy as AnyType).redirect = (url: string) => {
            redirectUrl = url;
        };
        strategy.authenticate(req);

        expect(redirectUrl).toBeDefined();
        const state = new URL(redirectUrl!).searchParams.get('state');
        expect(state).toBeTruthy();

        const stored = (req.session as AnyType)[sessionStateKey]?.state;
        expect(stored).toEqual(state);
    });

    it('rejects a callback whose state does not match the session', () => {
        const strategy = snowflakePassportStrategy!;
        const req = {
            session: {
                [sessionStateKey]: { state: 'expected-handle' },
            },
            query: { code: 'auth-code', state: 'unexpected-handle' },
        } as unknown as Request;

        const fail = vi.fn();
        (strategy as AnyType).fail = fail;
        strategy.authenticate(req);

        expect(fail).toHaveBeenCalledWith(expect.anything(), 403);
    });

    it('rejects a callback with no state in the session', () => {
        const strategy = snowflakePassportStrategy!;
        const req = {
            session: {},
            query: { code: 'auth-code', state: 'unexpected-handle' },
        } as unknown as Request;

        const fail = vi.fn();
        (strategy as AnyType).fail = fail;
        strategy.authenticate(req);

        expect(fail).toHaveBeenCalledWith(expect.anything(), 403);
    });
});
