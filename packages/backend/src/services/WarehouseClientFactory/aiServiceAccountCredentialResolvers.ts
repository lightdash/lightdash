import {
    assertUnreachable,
    ParameterError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { AiServiceAccountSecrets } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { WarehouseCredentialKind } from './ConnectionContext';
import type {
    CredentialSelection,
    CredentialSelectionSource,
} from './CredentialResolver';
import { CredentialResolverRegistry } from './CredentialResolverRegistry';
import { AthenaAiServiceAccountCredentialResolver } from './resolvers/AthenaAiServiceAccountCredentialResolver';
import { BigqueryAiServiceAccountCredentialResolver } from './resolvers/BigqueryAiServiceAccountCredentialResolver';
import { ClickhouseAiServiceAccountCredentialResolver } from './resolvers/ClickhouseAiServiceAccountCredentialResolver';
import { DatabricksAiServiceAccountCredentialResolver } from './resolvers/DatabricksAiServiceAccountCredentialResolver';
import { PostgresAiServiceAccountCredentialResolver } from './resolvers/PostgresAiServiceAccountCredentialResolver';
import { RedshiftAiServiceAccountCredentialResolver } from './resolvers/RedshiftAiServiceAccountCredentialResolver';
import { SnowflakeAiServiceAccountCredentialResolver } from './resolvers/SnowflakeAiServiceAccountCredentialResolver';
import { TrinoAiServiceAccountCredentialResolver } from './resolvers/TrinoAiServiceAccountCredentialResolver';

const trinoResolver = new TrinoAiServiceAccountCredentialResolver();
const redshiftResolver = new RedshiftAiServiceAccountCredentialResolver();
const postgresResolver = new PostgresAiServiceAccountCredentialResolver();
const athenaResolver = new AthenaAiServiceAccountCredentialResolver();
const snowflakeResolver = new SnowflakeAiServiceAccountCredentialResolver();
const bigqueryResolver = new BigqueryAiServiceAccountCredentialResolver();
const databricksResolver = new DatabricksAiServiceAccountCredentialResolver();

const clickhouseResolver = new ClickhouseAiServiceAccountCredentialResolver();

const entries = [
    { warehouseType: WarehouseTypes.TRINO, resolver: trinoResolver },
    { warehouseType: WarehouseTypes.CLICKHOUSE, resolver: clickhouseResolver },
    { warehouseType: WarehouseTypes.REDSHIFT, resolver: redshiftResolver },
    { warehouseType: WarehouseTypes.POSTGRES, resolver: postgresResolver },
    { warehouseType: WarehouseTypes.ATHENA, resolver: athenaResolver },
    {
        warehouseType: WarehouseTypes.SNOWFLAKE,
        resolver: snowflakeResolver,
    },
    {
        warehouseType: WarehouseTypes.DATABRICKS,
        resolver: databricksResolver,
    },
    {
        warehouseType: WarehouseTypes.BIGQUERY,
        resolver: bigqueryResolver,
    },
] as const;

export const isSupportedAiServiceAccountSlot = (
    warehouseType: WarehouseTypes,
    method: string,
): boolean =>
    entries.some(
        (entry) =>
            entry.warehouseType === warehouseType &&
            entry.resolver.supportedMethods.some(
                (supportedMethod) => supportedMethod === method,
            ),
    );

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
        case WarehouseTypes.TRINO:
            return trinoResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.REDSHIFT:
            return redshiftResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.POSTGRES:
            return postgresResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.SNOWFLAKE:
            return snowflakeResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.BIGQUERY:
            return bigqueryResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.DATABRICKS:
            return databricksResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.ATHENA:
            return athenaResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.CLICKHOUSE:
            return clickhouseResolver.buildCredentials(connection, secrets);
        case WarehouseTypes.DUCKDB:
            throw new ParameterError(
                'This warehouse does not support a shared agent account.',
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
    'credentialKind' | 'aiPlan' | 'owner' | 'refreshSource'
> &
    CredentialSelectionSource;

export const resolveAiServiceAccountCredentials = (selection: AiSelection) =>
    aiServiceAccountCredentialResolvers.resolveCredentialSelection(
        {
            ...selection,
            credentialKind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
            aiPlan: null,
        },
        async () => {
            throw new ParameterError(
                'This warehouse does not support a shared agent account.',
            );
        },
        'ai_service_account',
    );
