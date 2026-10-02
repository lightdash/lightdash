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
    getExpiredSharedSignInMessage,
    getPersonSignIn,
    PersonSignInProvider,
    resolveSignInSubject,
} from './sharedSignIn';

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

describe('resolveSignInSubject', () => {
    const signIn = {
        provider: PersonSignInProvider.GOOGLE,
        refreshToken: 'token-a',
    };

    it('has no subject for a credential that is not a person sign-in', () => {
        expect(
            resolveSignInSubject({
                signIn: null,
                actorUserUuid: 'actor',
                stored: [],
            }),
        ).toBeNull();
    });

    it('treats a new sign-in as the saving person', () => {
        expect(
            resolveSignInSubject({
                signIn,
                actorUserUuid: 'actor',
                stored: [{ refreshToken: 'token-b', subjectUserUuid: 'other' }],
            }),
        ).toBe('actor');
    });

    it('keeps the subject of a token that is already stored', () => {
        expect(
            resolveSignInSubject({
                signIn,
                actorUserUuid: 'admin-editing-settings',
                stored: [
                    { refreshToken: 'token-a', subjectUserUuid: 'founder' },
                ],
            }),
        ).toBe('founder');
    });

    it('falls back to the actor when the stored token has no recorded subject', () => {
        expect(
            resolveSignInSubject({
                signIn,
                actorUserUuid: 'actor',
                stored: [{ refreshToken: 'token-a', subjectUserUuid: null }],
            }),
        ).toBe('actor');
    });
});

describe('getExpiredSharedSignInMessage', () => {
    const expiry = {
        provider: PersonSignInProvider.GOOGLE,
        subjectUserUuid: 'subject',
        subjectName: 'Sam Rivera',
    };

    it('asks the subject to reconnect', () => {
        expect(getExpiredSharedSignInMessage(expiry, 'subject')).toBe(
            "Your Google sign-in for this project's connection has expired. Reconnect it in the project's connection settings.",
        );
    });

    it('names the subject for teammates', () => {
        expect(getExpiredSharedSignInMessage(expiry, 'teammate')).toBe(
            "This project's connection uses Sam Rivera's sign-in, which has expired. Ask Sam Rivera or an admin to reconnect.",
        );
    });

    it.each([
        [PersonSignInProvider.GOOGLE, 'Google'],
        [PersonSignInProvider.SNOWFLAKE, 'Snowflake'],
        [PersonSignInProvider.DATABRICKS, 'Databricks'],
    ])(
        'names the %s provider when the subject is unknown',
        (provider, label) => {
            expect(
                getExpiredSharedSignInMessage(
                    {
                        ...expiry,
                        provider,
                        subjectUserUuid: null,
                        subjectName: null,
                    },
                    null,
                ),
            ).toBe(
                `This project's connection uses a ${label} sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.`,
            );
        },
    );
});
