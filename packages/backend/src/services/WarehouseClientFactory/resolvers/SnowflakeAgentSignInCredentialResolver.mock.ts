import {
    WarehouseTypes,
    type AiAssurance,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import Logger from '../../../logging/logger';
import {
    logAgentSignInRefresh,
    mapAgentCredentialResolutionError,
} from '../../AiAccessService/AiAccessService';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../ConnectionContext';
import {
    SnowflakeAgentSignInCredentialResolver,
    type AgentSignInResolverDependencies,
} from './SnowflakeAgentSignInCredentialResolver';

type Args = {
    connection: CreateSnowflakeCredentials;
    person: { userUuid: string; organizationUuid: string; email: string };
    silentRefresh: boolean;
    organizationUuid?: string;
    evaluationKind?: 'query' | 'diagnostic' | 'result_read';
};

export class AgentSignInResolverHarness {
    readonly logger = Logger.child({ service: 'AiAccessService' });

    readonly warehouseType = WarehouseTypes.SNOWFLAKE;

    readonly resolver: SnowflakeAgentSignInCredentialResolver;

    constructor(
        deps: Pick<
            AgentSignInResolverDependencies,
            | 'featureFlagModel'
            | 'refreshTokenRotation'
            | 'snowflakeAgentClientResolver'
            | 'userWarehouseCredentialsModel'
        > & { lightdashConfig: unknown },
    ) {
        this.resolver = new SnowflakeAgentSignInCredentialResolver({
            ...deps,
            projectModel: {
                getSummary: vi.fn(),
                getOwnWarehouseCredentialsForProject: vi.fn(),
                rotateRefreshToken: vi.fn(),
            },
            organizationWarehouseCredentialsModel: {
                getByUuidWithSensitiveData: vi.fn(),
                rotateRefreshToken: vi.fn(),
            },
            warehouseConnectionModel: {
                getProject: vi.fn(),
                getOwnCredentials: vi.fn(),
                rotateRefreshToken: vi.fn(),
            },
            logger: { error: vi.fn() },
        });
    }

    async configurationError(organizationUuid: string) {
        return (await this.resolver.inspectClient(organizationUuid)) === null
            ? null
            : 'The Snowflake agent connection is not configured for this organisation. An organisation admin can add the OAuth client in Agent identity settings.';
    }

    async missingPrerequisite(args: Args) {
        const error = await this.resolver.inspect(
            args.person,
            args.silentRefresh,
        );
        return error
            ? mapAgentCredentialResolutionError(this.logger, error, {
                  ...args.person,
                  evaluationKind: 'diagnostic',
              }).refusal.reason
            : null;
    }

    selection(args: Args) {
        const context = {
            userUuid: args.person.userUuid,
            organizationUuid:
                args.organizationUuid ?? args.person.organizationUuid,
            evaluationKind: args.evaluationKind ?? 'query',
        };
        return {
            connection: args.connection,
            stored: {
                person: args.person,
                silentRefresh: args.silentRefresh,
                onRefresh: (
                    event: import('./SnowflakeAgentSignInCredentialResolver').AgentSignInRefreshEvent,
                ) => logAgentSignInRefresh(this.logger, event, context),
            },
            owner: null,
            context: connectionContextFromUser(args.person, {
                organizationUuid: args.person.organizationUuid,
                queryContext: null,
            }),
            projectUuid: null,
            warehouseConnectionUuid: null,
            credentialKind: WarehouseCredentialKind.AI_AGENT_SIGN_IN,
            aiPlan: null,
        };
    }

    async mint(args: Args) {
        const context = {
            userUuid: args.person.userUuid,
            organizationUuid:
                args.organizationUuid ?? args.person.organizationUuid,
            evaluationKind: args.evaluationKind ?? 'query',
        };
        try {
            const result = await this.resolver.resolve(this.selection(args));
            return {
                identityUuid: result.agentSignIn!.credentialUuid,
                credentials: result.clientCredentials,
                assurances: result.agentSignIn!.assurances,
                expiresAt: result.agentSignIn!.expiresAt,
            };
        } catch (error) {
            throw mapAgentCredentialResolutionError(
                this.logger,
                error,
                context,
            );
        }
    }

    probe(credentials: CreateSnowflakeCredentials, assurances: AiAssurance[]) {
        return this.resolver.probe(credentials, assurances);
    }
}
