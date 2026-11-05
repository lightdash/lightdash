import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    ParameterError,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    assertExtraConnectionAuthentication,
    shouldTestExtraCredentials,
} from './extraConnectionAuthentication';
import { warehouseConnectionCredentials } from './warehouseConnectionFixtures.mock';

const credentialsFor = <T extends WarehouseTypes>(
    type: T,
): Extract<CreateWarehouseCredentials, { type: T }> =>
    warehouseConnectionCredentials[type] as Extract<
        CreateWarehouseCredentials,
        { type: T }
    >;

const serverAuthenticationCases: CreateWarehouseCredentials[] = [
    ...Object.values(warehouseConnectionCredentials),
    ...[
        BigqueryAuthenticationType.PRIVATE_KEY,
        BigqueryAuthenticationType.ADC,
    ].map((authenticationType) => ({
        ...credentialsFor(WarehouseTypes.BIGQUERY),
        authenticationType,
    })),
    ...Object.values(AthenaAuthenticationType).map((authenticationType) => ({
        ...credentialsFor(WarehouseTypes.ATHENA),
        authenticationType,
    })),
    ...[
        RedshiftAuthenticationType.PASSWORD,
        RedshiftAuthenticationType.IAM,
    ].map((authenticationType) => ({
        ...credentialsFor(WarehouseTypes.REDSHIFT),
        authenticationType,
    })),
    ...[
        DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
        DatabricksAuthenticationType.OAUTH_M2M,
    ].map((authenticationType) => ({
        ...credentialsFor(WarehouseTypes.DATABRICKS),
        authenticationType,
    })),
    {
        ...credentialsFor(WarehouseTypes.DATABRICKS),
        authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
        refreshToken: 'refresh',
    },
    {
        ...credentialsFor(WarehouseTypes.DATABRICKS),
        authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
    },
    {
        ...credentialsFor(WarehouseTypes.SNOWFLAKE),
        authenticationType: SnowflakeAuthenticationType.SSO,
    },
    ...[
        SnowflakeAuthenticationType.PASSWORD,
        SnowflakeAuthenticationType.PRIVATE_KEY,
        SnowflakeAuthenticationType.SSO,
    ].map((authenticationType) => ({
        ...credentialsFor(WarehouseTypes.SNOWFLAKE),
        authenticationType,
        refreshToken: 'refresh',
    })),
];

const unsupportedPersonalAuthenticationCases: Extract<
    CreateWarehouseCredentials,
    {
        type:
            | WarehouseTypes.BIGQUERY
            | WarehouseTypes.REDSHIFT
            | WarehouseTypes.SNOWFLAKE;
    }
>[] = [
    {
        ...credentialsFor(WarehouseTypes.BIGQUERY),
        authenticationType: BigqueryAuthenticationType.SSO,
    },
    {
        ...credentialsFor(WarehouseTypes.REDSHIFT),
        authenticationType: RedshiftAuthenticationType.IAM_BROWSER,
    },
];

describe('shouldTestExtraCredentials', () => {
    it.each(serverAuthenticationCases)(
        'tests server-side $type authentication',
        (credentials) => {
            expect(
                shouldTestExtraCredentials(
                    credentials,
                    WarehouseTypes.POSTGRES,
                    true,
                ),
            ).toBe(true);
        },
    );
    it.each(
        unsupportedPersonalAuthenticationCases.flatMap((credentials) =>
            [true, false].map((requireUserCredentials) => ({
                ...credentials,
                requireUserCredentials,
            })),
        ),
    )(
        'refuses personal-only $type authentication with requireUserCredentials=$requireUserCredentials',
        (credentials) => {
            expect(() =>
                assertExtraConnectionAuthentication(credentials, true),
            ).toThrow(ParameterError);
            expect(() =>
                shouldTestExtraCredentials(
                    credentials,
                    WarehouseTypes.POSTGRES,
                    true,
                ),
            ).toThrow('compilation requires shared credentials');
        },
    );
    it('keeps the existing Snowflake NONE credential requirement', () => {
        const credentials = {
            ...credentialsFor(WarehouseTypes.SNOWFLAKE),
            authenticationType: SnowflakeAuthenticationType.NONE,
        };
        expect(
            shouldTestExtraCredentials(
                { ...credentials, requireUserCredentials: true },
                WarehouseTypes.SNOWFLAKE,
                true,
            ),
        ).toBe(false);
        expect(() =>
            shouldTestExtraCredentials(
                { ...credentials, requireUserCredentials: false },
                WarehouseTypes.SNOWFLAKE,
                true,
            ),
        ).toThrow(
            'A Snowflake connection without shared credentials requires users to provide their own credentials on the original connection.',
        );
        expect(() =>
            shouldTestExtraCredentials(
                { ...credentials, requireUserCredentials: false },
                WarehouseTypes.POSTGRES,
                true,
            ),
        ).toThrow(
            'A Snowflake connection without shared credentials requires users to provide their own credentials for this project.',
        );
    });
    it.each([
        SnowflakeAuthenticationType.EXTERNAL_BROWSER,
        SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
    ])('refuses interactive Snowflake mode %s', (authenticationType) => {
        expect(() =>
            shouldTestExtraCredentials(
                {
                    ...credentialsFor(WarehouseTypes.SNOWFLAKE),
                    authenticationType,
                },
                WarehouseTypes.SNOWFLAKE,
                true,
            ),
        ).toThrow('External browser authentication is not supported');
    });
    it('keeps main behaviour with mixed warehouse connections off', () => {
        const snowflake = credentialsFor(WarehouseTypes.SNOWFLAKE);
        expect(() =>
            shouldTestExtraCredentials(
                {
                    ...snowflake,
                    authenticationType:
                        SnowflakeAuthenticationType.EXTERNAL_BROWSER,
                },
                WarehouseTypes.SNOWFLAKE,
                false,
            ),
        ).toThrow(
            'External browser authentication is not supported for an extra Snowflake connection.',
        );
        expect(
            shouldTestExtraCredentials(
                {
                    ...snowflake,
                    authenticationType:
                        SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
                },
                WarehouseTypes.SNOWFLAKE,
                false,
            ),
        ).toBe(true);
        expect(() =>
            assertExtraConnectionAuthentication(
                {
                    ...credentialsFor(WarehouseTypes.BIGQUERY),
                    authenticationType: BigqueryAuthenticationType.SSO,
                } as never,
                false,
            ),
        ).not.toThrow();
    });
});
