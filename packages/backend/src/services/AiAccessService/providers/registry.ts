import { assertUnreachable, WarehouseTypes } from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type AiCredentialProvider } from './AiCredentialProvider';
import { PostgresAiCredentialProvider } from './PostgresAiCredentialProvider';
import { SnowflakeAiCredentialProvider } from './SnowflakeAiCredentialProvider';
import { UnavailableAiCredentialProvider } from './UnavailableAiCredentialProvider';

export type AiCredentialProviderRegistry = (
    type: WarehouseTypes,
) => AiCredentialProvider;

export type AiCredentialProviderDependencies = {
    lightdashConfig: LightdashConfig;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
};

export const createAiCredentialProviderRegistry =
    (deps: AiCredentialProviderDependencies): AiCredentialProviderRegistry =>
    (type) => {
        switch (type) {
            case WarehouseTypes.SNOWFLAKE:
                return new SnowflakeAiCredentialProvider(deps);
            case WarehouseTypes.REDSHIFT:
                return new UnavailableAiCredentialProvider(
                    type,
                    'AI principals for Redshift are coming soon.',
                );
            case WarehouseTypes.DATABRICKS:
                return new UnavailableAiCredentialProvider(
                    type,
                    'AI principals for Databricks are coming soon.',
                );
            case WarehouseTypes.BIGQUERY:
                return new UnavailableAiCredentialProvider(
                    type,
                    'AI principals for BigQuery are coming soon.',
                );
            case WarehouseTypes.POSTGRES:
                return new PostgresAiCredentialProvider();
            case WarehouseTypes.CLICKHOUSE:
                return new UnavailableAiCredentialProvider(
                    type,
                    'AI principals for ClickHouse are coming soon. They need a user per principal with certificate or SSH key sign-in and the query cache pinned off.',
                );
            case WarehouseTypes.TRINO:
                return new UnavailableAiCredentialProvider(
                    type,
                    'AI principals for Trino are coming soon. They need a JWT or certificate sign-in for this instance and user impersonation.',
                );
            case WarehouseTypes.ATHENA:
                return new UnavailableAiCredentialProvider(
                    type,
                    'AI principals for Athena are coming soon. They need an IAM role and a workgroup per principal.',
                );
            case WarehouseTypes.DUCKDB:
                return new UnavailableAiCredentialProvider(
                    type,
                    'AI principals for DuckDB are coming soon. DuckDB has no row or column security, so only a shared principal on a database without protected data is possible.',
                );
            default:
                return assertUnreachable(type, 'Unknown warehouse type');
        }
    };
