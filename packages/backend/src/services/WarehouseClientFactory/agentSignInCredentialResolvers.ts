import {
    ParameterError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { WarehouseCredentialKind } from './ConnectionContext';
import type { CredentialSelection } from './CredentialResolver';
import { CredentialResolverRegistry } from './CredentialResolverRegistry';
import {
    type AgentSignInInput,
    type SnowflakeAgentSignInCredentialResolver,
} from './resolvers/SnowflakeAgentSignInCredentialResolver';

export const createAgentSignInCredentialResolverRegistry = (
    resolver: Pick<
        SnowflakeAgentSignInCredentialResolver,
        'resolve' | 'validateOnSave' | 'cacheKeyIdentity' | 'dispose'
    >,
): CredentialResolverRegistry => {
    const registry = new CredentialResolverRegistry();
    registry.register(WarehouseTypes.SNOWFLAKE, 'agent_identity', resolver);
    return registry;
};

export const resolveAgentSignInCredentials = (
    registry: CredentialResolverRegistry,
    selection: Omit<
        CredentialSelection<CreateSnowflakeCredentials, AgentSignInInput>,
        'credentialKind' | 'aiPlan'
    >,
) =>
    registry.resolveCredentialSelection(
        {
            ...selection,
            credentialKind: WarehouseCredentialKind.AI_AGENT_SIGN_IN,
            aiPlan: null,
        },
        async () => {
            throw new ParameterError(
                'This warehouse does not support agent sign-in.',
            );
        },
        'agent_identity',
    );
