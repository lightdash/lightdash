import {
    assertUnreachable,
    BigqueryAuthenticationType,
    ParameterError,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

const personalCredentialsOnly = (
    credentials: CreateWarehouseCredentials,
    authentication: string,
): false => {
    if (!credentials.requireUserCredentials) {
        throw new ParameterError(
            `${authentication} without shared credentials requires users to provide their own credentials for this connection.`,
        );
    }
    return false;
};

export const assertExtraConnectionAuthentication = (
    credentials: CreateWarehouseCredentials,
): void => {
    if (
        credentials.type === WarehouseTypes.SNOWFLAKE &&
        (credentials.authenticationType ===
            SnowflakeAuthenticationType.EXTERNAL_BROWSER ||
            credentials.authenticationType ===
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE)
    ) {
        throw new ParameterError(
            'External browser authentication is not supported for an extra Snowflake connection.',
        );
    }
};

export const shouldTestExtraCredentials = (
    credentials: CreateWarehouseCredentials,
): boolean => {
    assertExtraConnectionAuthentication(credentials);
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            if (
                credentials.authenticationType ===
                BigqueryAuthenticationType.SSO
            ) {
                return personalCredentialsOnly(credentials, 'BigQuery SSO');
            }
            return true;
        case WarehouseTypes.REDSHIFT:
            if (
                credentials.authenticationType ===
                RedshiftAuthenticationType.IAM_BROWSER
            ) {
                return personalCredentialsOnly(
                    credentials,
                    'Redshift browser IAM authentication',
                );
            }
            return true;
        case WarehouseTypes.SNOWFLAKE:
            if (
                credentials.authenticationType ===
                SnowflakeAuthenticationType.NONE
            ) {
                if (!credentials.requireUserCredentials) {
                    throw new ParameterError(
                        'A Snowflake connection without shared credentials requires users to provide their own credentials for this project.',
                    );
                }
                return false;
            }
            return true;
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
        case WarehouseTypes.DATABRICKS:
            return true;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};
