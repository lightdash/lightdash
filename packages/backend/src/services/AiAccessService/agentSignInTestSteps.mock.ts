import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    WarehouseTypes,
    type AiAssurance,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { AgentCredentialResolutionError } from '../WarehouseClientFactory/resolvers/AgentCredentialResolutionError';
import { type SnowflakeAgentSignInCredentialResolver } from '../WarehouseClientFactory/resolvers/SnowflakeAgentSignInCredentialResolver';
import {
    AiSessionFailureReason,
    type AiSessionProbeResult,
} from './agentSession';
import { type AiAccessEvaluation } from './AiAccessService';

export type AiMintArgs<T extends CreateWarehouseCredentials> = {
    silentRefresh: boolean;
    connection: T;
    person: { organizationUuid: string; userUuid: string; email: string };
};

export type TestResolvedAgentCredentials<T extends CreateWarehouseCredentials> =
    {
        identityUuid: string;
        credentials: T;
        assurances: AiAssurance[];
        expiresAt: Date | null;
    };

export interface AgentSignInTestSteps<
    T extends CreateWarehouseCredentials = CreateSnowflakeCredentials,
> {
    readonly warehouseType: T['type'];
    configurationError(organizationUuid: string): Promise<string | null>;
    missingPrerequisite(
        args: AiMintArgs<T>,
    ): Promise<AiAccessRefusalReason | null>;
    mint(
        args: AiMintArgs<T> & {
            organizationUuid: string;
            evaluationKind: AiAccessEvaluation['kind'];
        },
    ): Promise<TestResolvedAgentCredentials<T>>;
    probe(
        credentials: T,
        assurances: AiAssurance[],
    ): Promise<AiSessionProbeResult>;
}

export const agentSignInResolverMock = (
    steps: () => AgentSignInTestSteps,
): Pick<
    SnowflakeAgentSignInCredentialResolver,
    | 'resolve'
    | 'validateOnSave'
    | 'cacheKeyIdentity'
    | 'dispose'
    | 'inspect'
    | 'inspectClient'
> => ({
    inspectClient: async (organizationUuid) => {
        const message = await steps().configurationError(organizationUuid);
        if (message)
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                { message },
            );
        return null;
    },
    inspect: async (person, silentRefresh) => {
        const reason = await steps().missingPrerequisite({
            person,
            silentRefresh,
            connection: {
                type: WarehouseTypes.SNOWFLAKE,
            } as CreateSnowflakeCredentials,
        });
        if (reason === AiAccessRefusalReason.NEEDS_SIGN_IN)
            return new AgentCredentialResolutionError({
                kind: 'credential',
                classification: 'missing',
            });
        if (reason === AiAccessRefusalReason.SIGN_IN_EXPIRED)
            return new AgentCredentialResolutionError({
                kind: 'credential',
                classification: 'expired',
            });
        if (reason === AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED)
            return new AgentCredentialResolutionError({
                kind: 'client',
                classification: 'missing',
            });
        if (reason && reason !== AiAccessRefusalReason.PRINCIPAL_FAILED)
            throw new AiAccessRefusedError(reason);
        if (reason)
            return new AgentCredentialResolutionError({
                kind: 'session',
                session: {
                    ok: false,
                    transient: false,
                    cause: null,
                    checkedAt: new Date(),
                    observed: {},
                    message: 'Inactive session',
                    reason: AiSessionFailureReason.NOT_AGENT_SESSION,
                },
            });
        return null;
    },
    resolve: async (input) => {
        const selected = steps();
        const resolved = await selected.mint({
            connection: input.connection,
            person: input.stored.person,
            silentRefresh: input.stored.silentRefresh,
            organizationUuid: input.stored.person.organizationUuid,
            evaluationKind:
                input.context.aiAccess === 'diagnostic'
                    ? 'diagnostic'
                    : 'query',
        });
        const session = await selected.probe(
            resolved.credentials,
            resolved.assurances,
        );
        if (!session.ok)
            throw new AgentCredentialResolutionError(
                { kind: 'session', session },
                session.cause,
            );
        if (resolved.credentials.type !== WarehouseTypes.SNOWFLAKE)
            throw new Error('Expected Snowflake credentials');
        return {
            clientCredentials: resolved.credentials,
            clientOptions: {},
            cacheable: true,
            agentSignIn: {
                credentialUuid: resolved.identityUuid,
                assurances: resolved.assurances,
                expiresAt: resolved.expiresAt,
                clientVersion: null,
            },
        };
    },
    validateOnSave: async (input) => ({
        connection: input.connection,
        stored: input.stored,
    }),
    cacheKeyIdentity: () => [],
    dispose: async () => {},
});
