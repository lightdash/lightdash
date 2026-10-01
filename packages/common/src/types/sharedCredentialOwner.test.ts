import { describe, expect, it } from 'vitest';
import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateDatabricksCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
} from './projects';
import {
    getPersonSignIn,
    PersonSignInProvider,
    resolveCredentialOwner,
} from './sharedCredentialOwner';

const bigquery = (
    keyfileContents: Record<string, string>,
    authenticationType = BigqueryAuthenticationType.SSO,
): CreateBigqueryCredentials => ({
    type: WarehouseTypes.BIGQUERY,
    project: 'p',
    dataset: 'd',
    keyfileContents,
    authenticationType,
    location: undefined,
    timeoutSeconds: 300,
    priority: 'interactive',
    retries: 3,
    maximumBytesBilled: undefined,
});

const snowflake = (
    authenticationType: SnowflakeAuthenticationType,
    refreshToken?: string,
): CreateSnowflakeCredentials =>
    ({
        type: WarehouseTypes.SNOWFLAKE,
        account: 'acct',
        user: 'u',
        role: 'r',
        database: 'db',
        warehouse: 'wh',
        schema: 's',
        authenticationType,
        refreshToken,
    }) as CreateSnowflakeCredentials;

const databricks = (
    authenticationType: DatabricksAuthenticationType,
    refreshToken?: string,
): CreateDatabricksCredentials =>
    ({
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'h',
        httpPath: '/p',
        database: 'db',
        authenticationType,
        refreshToken,
    }) as CreateDatabricksCredentials;

describe('getPersonSignIn', () => {
    it('finds a Google sign-in saved at setup or by the CLI', () => {
        expect(
            getPersonSignIn(
                bigquery({ type: 'authorized_user', refresh_token: 'r1' }),
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            refreshToken: 'r1',
        });
        expect(
            getPersonSignIn(
                bigquery(
                    { type: 'authorized_user', refresh_token: 'r2' },
                    BigqueryAuthenticationType.PRIVATE_KEY,
                ),
            )?.provider,
        ).toBe(PersonSignInProvider.GOOGLE);
    });

    it('does not count a service account key file or runtime credentials', () => {
        expect(
            getPersonSignIn(
                bigquery(
                    { type: 'service_account', private_key: 'k' },
                    BigqueryAuthenticationType.PRIVATE_KEY,
                ),
            ),
        ).toBeNull();
        expect(
            getPersonSignIn(
                bigquery(
                    { type: 'authorized_user', refresh_token: 'r' },
                    BigqueryAuthenticationType.ADC,
                ),
            ),
        ).toBeNull();
    });

    it('finds Snowflake SSO and Databricks U2M with a stored token only', () => {
        expect(
            getPersonSignIn(snowflake(SnowflakeAuthenticationType.SSO, 's1'))
                ?.provider,
        ).toBe(PersonSignInProvider.SNOWFLAKE);
        expect(
            getPersonSignIn(snowflake(SnowflakeAuthenticationType.SSO)),
        ).toBeNull();
        expect(
            getPersonSignIn(
                snowflake(SnowflakeAuthenticationType.PRIVATE_KEY, 's1'),
            ),
        ).toBeNull();
        expect(
            getPersonSignIn(
                databricks(DatabricksAuthenticationType.OAUTH_U2M, 'd1'),
            )?.provider,
        ).toBe(PersonSignInProvider.DATABRICKS);
        expect(
            getPersonSignIn(
                databricks(DatabricksAuthenticationType.OAUTH_M2M, 'd1'),
            ),
        ).toBeNull();
    });

    it('never counts warehouses without a person sign-in', () => {
        expect(
            getPersonSignIn({
                type: WarehouseTypes.POSTGRES,
            } as CreateWarehouseCredentials),
        ).toBeNull();
    });
});

describe('resolveCredentialOwner', () => {
    const signIn = {
        provider: PersonSignInProvider.GOOGLE,
        refreshToken: 'token-a',
    };

    it('has no owner for a credential that is not a person sign-in', () => {
        expect(
            resolveCredentialOwner({
                signIn: null,
                actorUserUuid: 'actor',
                stored: [],
            }),
        ).toBeNull();
    });

    it('makes the person saving a new sign-in its owner', () => {
        expect(
            resolveCredentialOwner({
                signIn,
                actorUserUuid: 'actor',
                stored: [{ refreshToken: 'token-b', ownerUserUuid: 'other' }],
            }),
        ).toBe('actor');
    });

    it('keeps the owner of a token that is already stored', () => {
        expect(
            resolveCredentialOwner({
                signIn,
                actorUserUuid: 'admin-editing-settings',
                stored: [{ refreshToken: 'token-a', ownerUserUuid: 'founder' }],
            }),
        ).toBe('founder');
    });

    it('falls back to the actor when the stored token has no recorded owner', () => {
        expect(
            resolveCredentialOwner({
                signIn,
                actorUserUuid: 'actor',
                stored: [{ refreshToken: 'token-a', ownerUserUuid: null }],
            }),
        ).toBe('actor');
    });
});
