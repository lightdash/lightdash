import { describe, expect, it } from 'vitest';
import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    RedshiftAuthenticationType,
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
    hasServiceCredential,
    PersonSignInProvider,
    resolveSignInSubject,
    SignInSubjectBasis,
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

function snowflake(
    authenticationType: SnowflakeAuthenticationType,
    refreshToken?: string,
): CreateSnowflakeCredentials {
    return {
        type: WarehouseTypes.SNOWFLAKE,
        account: 'acct',
        user: 'u',
        role: 'r',
        database: 'db',
        warehouse: 'wh',
        schema: 's',
        authenticationType,
        refreshToken,
    } as CreateSnowflakeCredentials;
}

function databricks(
    authenticationType: DatabricksAuthenticationType,
    refreshToken?: string,
): CreateDatabricksCredentials {
    return {
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'h',
        httpPath: '/p',
        database: 'db',
        authenticationType,
        refreshToken,
    } as CreateDatabricksCredentials;
}

describe('hasServiceCredential', () => {
    it('distinguishes Google user OAuth from private keys and ADC', () => {
        expect(
            hasServiceCredential(
                bigquery({ type: 'authorized_user', refresh_token: 'r' }),
            ),
        ).toBe(false);
        expect(
            hasServiceCredential(
                bigquery({ type: 'service_account', private_key: 'k' }),
            ),
        ).toBe(true);
        expect(
            hasServiceCredential(bigquery({}, BigqueryAuthenticationType.ADC)),
        ).toBe(true);
    });

    it('distinguishes Snowflake and Databricks service methods from person sign-ins', () => {
        expect(
            hasServiceCredential(
                snowflake(SnowflakeAuthenticationType.SSO, 'r'),
            ),
        ).toBe(false);
        expect(
            hasServiceCredential({
                ...snowflake(SnowflakeAuthenticationType.PASSWORD),
                password: 'p',
            }),
        ).toBe(true);
        expect(
            hasServiceCredential(
                databricks(DatabricksAuthenticationType.OAUTH_U2M, 'r'),
            ),
        ).toBe(false);
        expect(
            hasServiceCredential({
                ...databricks(DatabricksAuthenticationType.OAUTH_M2M),
                oauthClientId: 'i',
                oauthClientSecret: 's',
            }),
        ).toBe(true);
    });

    it.each([
        [{ type: WarehouseTypes.POSTGRES, password: 'p' }, true],
        [{ type: WarehouseTypes.TRINO, password: 'p' }, true],
        [{ type: WarehouseTypes.CLICKHOUSE, password: 'p' }, true],
        [
            {
                type: WarehouseTypes.REDSHIFT,
                authenticationType: RedshiftAuthenticationType.PASSWORD,
                password: 'p',
            },
            true,
        ],
        [
            {
                type: WarehouseTypes.REDSHIFT,
                authenticationType: RedshiftAuthenticationType.IAM,
            },
            true,
        ],
        [
            {
                type: WarehouseTypes.REDSHIFT,
                authenticationType: RedshiftAuthenticationType.IAM_BROWSER,
                accessKeyId: 'temporary',
                secretAccessKey: 'temporary',
            },
            false,
        ],
        [
            {
                type: WarehouseTypes.ATHENA,
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                accessKeyId: 'a',
                secretAccessKey: 's',
            },
            true,
        ],
        [
            {
                type: WarehouseTypes.ATHENA,
                authenticationType: AthenaAuthenticationType.IAM_ROLE,
            },
            true,
        ],
        [
            {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                token: 't',
            },
            true,
        ],
        [
            {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.EMBEDDED,
            },
            true,
        ],
    ] as const)(
        'classifies the remaining warehouse credential %j',
        (credentials, expected) => {
            expect(
                hasServiceCredential(
                    credentials as unknown as CreateWarehouseCredentials,
                ),
            ).toBe(expected);
        },
    );
});

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

    it('keeps an unknown subject when the stored token has no recorded subject', () => {
        expect(
            resolveSignInSubject({
                signIn,
                actorUserUuid: 'actor',
                stored: [{ refreshToken: 'token-a', subjectUserUuid: null }],
            }),
        ).toBeNull();
    });
});

describe('getExpiredSharedSignInMessage', () => {
    const expiry = {
        provider: PersonSignInProvider.GOOGLE,
        subjectUserUuid: 'subject',
        subjectName: 'Sam Rivera',
        subjectBasis: SignInSubjectBasis.RECORDED,
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

    it('uses the generic message for an anonymous viewer', () => {
        expect(getExpiredSharedSignInMessage(expiry, null)).toBe(
            "This project's connection uses a Google sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.",
        );
    });

    it('tells the creator to reconnect without claiming the sign-in is theirs', () => {
        expect(
            getExpiredSharedSignInMessage(
                { ...expiry, subjectBasis: SignInSubjectBasis.PROJECT_CREATOR },
                'subject',
            ),
        ).toBe(
            "This project's Google sign-in has expired. You created this project. Reconnect it in Project settings → Connection settings.",
        );
    });

    it('names the creator for teammates without claiming the sign-in is theirs', () => {
        expect(
            getExpiredSharedSignInMessage(
                { ...expiry, subjectBasis: SignInSubjectBasis.PROJECT_CREATOR },
                'teammate',
            ),
        ).toBe(
            "This project's Google sign-in has expired. Sam Rivera created this project. Ask them or a project admin to reconnect it in Project settings → Connection settings.",
        );
    });

    it('uses the nobody message when the creator has no name', () => {
        expect(
            getExpiredSharedSignInMessage(
                {
                    ...expiry,
                    subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
                    subjectName: '',
                },
                'teammate',
            ),
        ).toBe(
            "This project's connection uses a Google sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.",
        );
    });

    it('uses the nobody message when the subject is unknown', () => {
        expect(
            getExpiredSharedSignInMessage(
                {
                    ...expiry,
                    subjectUserUuid: null,
                    subjectName: null,
                    subjectBasis: null,
                },
                null,
            ),
        ).toBe(
            "This project's connection uses a Google sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.",
        );
    });

    it.each([
        [PersonSignInProvider.SNOWFLAKE, 'Snowflake'],
        [PersonSignInProvider.DATABRICKS, 'Databricks'],
    ])('names the %s provider for a creator guess', (provider, label) => {
        expect(
            getExpiredSharedSignInMessage(
                {
                    ...expiry,
                    provider,
                    subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
                },
                'teammate',
            ),
        ).toBe(
            `This project's ${label} sign-in has expired. Sam Rivera created this project. Ask them or a project admin to reconnect it in Project settings → Connection settings.`,
        );
    });
});
