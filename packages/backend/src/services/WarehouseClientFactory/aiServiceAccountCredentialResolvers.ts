import {
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

const entries = [
    {
        warehouseType: WarehouseTypes.DATABRICKS,
        resolver: new DatabricksAiServiceAccountCredentialResolver(),
    },
    {
        warehouseType: WarehouseTypes.BIGQUERY,
        resolver: new BigqueryAiServiceAccountCredentialResolver(),
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
    const entry = entries.find(
        ({ warehouseType }) => warehouseType === connection.type,
    );
    if (!entry)
        throw new ParameterError(
            'This warehouse does not support an AI service account.',
        );
    return entry.resolver.buildCredentials(connection, secrets);
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
