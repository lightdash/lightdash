import {
    assertUnreachable,
    BigqueryAuthenticationType,
    ParameterError,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

export const assertExtraConnectionAuthentication = (
    credentials: CreateWarehouseCredentials,
): void => {
    if (
        credentials.type === WarehouseTypes.BIGQUERY &&
        credentials.authenticationType === BigqueryAuthenticationType.SSO
    ) {
        throw new ParameterError(
            'BigQuery SSO is not supported for an extra connection because compilation requires shared credentials.',
        );
    }
    if (
        credentials.type === WarehouseTypes.REDSHIFT &&
        credentials.authenticationType ===
            RedshiftAuthenticationType.IAM_BROWSER
    ) {
        throw new ParameterError(
            'Redshift browser IAM authentication is not supported for an extra connection because compilation requires shared credentials.',
        );
    }
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
    originalWarehouseType: WarehouseTypes | null,
): boolean => {
    assertExtraConnectionAuthentication(credentials);
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            if (
                credentials.authenticationType ===
                SnowflakeAuthenticationType.NONE
            ) {
                if (!credentials.requireUserCredentials) {
                    throw new ParameterError(
                        originalWarehouseType === null ||
                            originalWarehouseType === WarehouseTypes.SNOWFLAKE
                            ? 'A Snowflake connection without shared credentials requires users to provide their own credentials on the original connection.'
                            : 'A Snowflake connection without shared credentials requires users to provide their own credentials for this project.',
                    );
                }
                return false;
            }
            return true;
        case WarehouseTypes.BIGQUERY:
        case WarehouseTypes.REDSHIFT:
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
