import {
    assertUnreachable,
    ParameterError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { AiServiceAccountSecrets } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { WarehouseCredentialKind } from './ConnectionContext';
import type { CredentialSelection } from './CredentialResolver';
import { CredentialResolverRegistry } from './CredentialResolverRegistry';
import { BigqueryAiServiceAccountCredentialResolver } from './resolvers/BigqueryAiServiceAccountCredentialResolver';
import { DatabricksAiServiceAccountCredentialResolver } from './resolvers/DatabricksAiServiceAccountCredentialResolver';
import { SnowflakeAiServiceAccountCredentialResolver } from './resolvers/SnowflakeAiServiceAccountCredentialResolver';

const snowflakeResolver = new SnowflakeAiServiceAccountCredentialResolver();
const bigqueryResolver = new BigqueryAiServiceAccountCredentialResolver();

const entries = [
    {
        warehouseType: WarehouseTypes.SNOWFLAKE,
        resolver: snowflakeResolver,
    },
    {
        warehouseType: WarehouseTypes.DATABRICKS,
        resolver: new DatabricksAiServiceAccountCredentialResolver(),
    },
    {
        warehouseType: WarehouseTypes.BIGQUERY,
        resolver: bigqueryResolver,
    },
] as const;

export const registerAiServiceAccountCredentialResolvers = (
    registry: CredentialResolverRegistry,
): void => {
    for (const entry of entries) {
        registry.register(
            entry.warehouseType,
            'ai_service_account',
            entry.resolver,
        );
    }
};

export const buildAiServiceAccountCredentials = (
    connection: CreateWarehouseCredentials,
    secrets: AiServiceAccountSecrets,
): CreateWarehouseCredentials => {
    switch (connection.type) {
        case WarehouseTypes.SNOWFLAKE:
            return snowflakeResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.BIGQUERY:
            return bigqueryResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.DATABRICKS:
        case WarehouseTypes.DUCKDB:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.TRINO:
            throw new ParameterError(
                'This warehouse does not support an AI service account.',
            );
        default:
            return assertUnreachable(connection, 'Unknown warehouse type');
    }
};

export const aiServiceAccountCredentialResolvers =
    new CredentialResolverRegistry();
registerAiServiceAccountCredentialResolvers(
    aiServiceAccountCredentialResolvers,
);

type AiSelection = Omit<
    CredentialSelection<CreateWarehouseCredentials, AiServiceAccountSecrets>,
    'credentialKind' | 'aiPlan'
>;

export const resolveAiServiceAccountCredentials = (selection: AiSelection) =>
    aiServiceAccountCredentialResolvers.resolveCredentialSelection(
        {
            ...selection,
            credentialKind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
            aiPlan: null,
        },
        async () => {
            throw new ParameterError(
                'This warehouse does not support an AI service account.',
            );
        },
        'ai_service_account',
    );
