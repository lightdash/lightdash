import { assertUnreachable, WarehouseTypes } from '@lightdash/common';
import { type AiCredentialProvider } from './AiCredentialProvider';
import { UnavailableAiCredentialProvider } from './UnavailableAiCredentialProvider';

export type AiCredentialProviderRegistry = (
    type: WarehouseTypes,
) => AiCredentialProvider;

export const getAiCredentialProvider: AiCredentialProviderRegistry = (type) => {
    switch (type) {
        case WarehouseTypes.SNOWFLAKE:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for Snowflake are not available in this version.',
            );
        case WarehouseTypes.REDSHIFT:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for Redshift are not available in this version.',
            );
        case WarehouseTypes.DATABRICKS:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for Databricks are not available in this version.',
            );
        case WarehouseTypes.BIGQUERY:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for BigQuery are not available in this version.',
            );
        case WarehouseTypes.POSTGRES:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for Postgres need a login role per principal. Not available in this version.',
            );
        case WarehouseTypes.CLICKHOUSE:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for ClickHouse need a user per principal with certificate or SSH key sign-in and the query cache pinned off. Not available in this version.',
            );
        case WarehouseTypes.TRINO:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for Trino need a JWT or certificate sign-in for Lightdash and user impersonation. Lightdash signs in with Basic auth today.',
            );
        case WarehouseTypes.ATHENA:
            return new UnavailableAiCredentialProvider(
                type,
                'AI principals for Athena need an IAM role and a workgroup per principal. Not available in this version.',
            );
        case WarehouseTypes.DUCKDB:
            return new UnavailableAiCredentialProvider(
                type,
                'DuckDB has no row or column security, so only a shared AI principal on a protected-data-free database is possible. Not available in this version.',
            );
        default:
            return assertUnreachable(type, 'Unknown warehouse type');
    }
};
