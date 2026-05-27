import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';

export const getCredentialsWithPlaceholders = (
    credentials: UserWarehouseCredentials['credentials'],
): UpsertUserWarehouseCredentials['credentials'] => {
    switch (credentials.type) {
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return {
                ...credentials,
                password: '',
            };
        case WarehouseTypes.BIGQUERY:
            return {
                ...credentials,
                keyfileContents: {},
            };
        case WarehouseTypes.DATABRICKS:
            return {
                ...credentials,
                personalAccessToken: '',
            };
        case WarehouseTypes.ATHENA:
            return {
                ...credentials,
                accessKeyId: '',
                secretAccessKey: '',
            };
        default:
            throw new Error(`Credential type not supported`);
    }
};
