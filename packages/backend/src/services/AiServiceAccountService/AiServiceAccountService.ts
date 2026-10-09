import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    supportsAiServiceAccount,
    type Account,
    type AgentAccessReport,
    type AgentAccessTestRequest,
    type AiServiceAccountCredentialInput,
    type AiServiceAccountParent,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type UUID,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { trackSafely } from '../../analytics/trackSafely';
import { createAuditLogEvent } from '../../logging/auditLog';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import { redactCredentialError } from '../../logging/redactCredentialError';
import { logAuditEvent } from '../../logging/winston';
import { type AiServiceAccountCredentialsModel } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import { type ProjectService } from '../ProjectService/ProjectService';
import {
    aiServiceAccountCredentialResolvers,
    buildAiServiceAccountCredentials,
} from '../WarehouseClientFactory/aiServiceAccountCredentialResolvers';
import {
    connectionContextFromAccount,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import { mergeAiServiceAccountCredentials } from './applyAiServiceAccountCredentials';
import {
    AiServiceAccountSlotResolutionError,
    AiServiceAccountSlotResolver,
} from './resolveAiServiceAccountSlot';
import { testAgentAccess } from './testAgentAccess';

type Dependencies = {
    analytics: Pick<LightdashAnalytics, 'track'>;
    aiServiceAccountCredentialsModel: AiServiceAccountCredentialsModel;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    warehouseConnectionModel: WarehouseConnectionModel;
    projectService: Pick<ProjectService, 'warehouseClientFactory'>;
};

export class AiServiceAccountService extends BaseService {
    constructor(private readonly deps: Dependencies) {
        super();
    }

    private async loadConnection(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        resolveAuditName: boolean,
    ) {
        assertIsAccountWithOrg(account);
        const { organizationUuid, name: projectName } =
            await this.deps.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const { enabled } = await this.deps.featureFlagModel.get({
            user: { userUuid: account.user.id, organizationUuid },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        if (!enabled)
            throw new FeatureNotEnabledError(FeatureFlags.AgentIdentity);
        let warehouseConnectionUuid = connectionUuid;
        let connectionName = projectName;
        if (warehouseConnectionUuid !== null) {
            const project =
                await this.deps.warehouseConnectionModel.getProject(
                    projectUuid,
                );
            const connection = await this.deps.warehouseConnectionModel.get(
                project,
                warehouseConnectionUuid,
            );
            connectionName = connection.name;
            if (connection.isOriginal) warehouseConnectionUuid = null;
        } else if (resolveAuditName) {
            const project =
                await this.deps.warehouseConnectionModel.getProject(
                    projectUuid,
                );
            const connections =
                await this.deps.warehouseConnectionModel.list(project);
            connectionName =
                connections.find((connection) => connection.isOriginal)?.name ??
                projectName;
        }
        const connection =
            warehouseConnectionUuid === null
                ? await this.deps.projectModel.getWarehouseCredentialsForBinding(
                      projectUuid,
                      { kind: 'connection', warehouseConnectionUuid: null },
                  )
                : await this.deps.warehouseConnectionModel.getCredentials(
                      await this.deps.warehouseConnectionModel.getProject(
                          projectUuid,
                      ),
                      warehouseConnectionUuid,
                  );
        if (!supportsAiServiceAccount(connection.type)) {
            throw new ParameterError(
                'This warehouse does not support an AI service account.',
            );
        }
        return {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        };
    }

    private recordChange(
        account: Account,
        action: 'create' | 'update' | 'delete' | 'test',
        projectUuid: string,
        organizationUuid: string,
        metadata: {
            event: string;
            warehouseConnectionUuid: string | null;
            connectionName: string;
            previousGeneration: string | null;
            generation: string | null;
            inheritedFromProjectUuid: string | null;
            result: 'success' | 'failure' | null;
        },
    ): void {
        try {
            logAuditEvent(
                createAuditLogEvent(
                    createActorFromAccount(account),
                    action,
                    {
                        type: 'AiServiceAccount',
                        organizationUuid,
                        projectUuid,
                        metadata,
                    },
                    {},
                    'allowed',
                ),
            );
        } catch (error) {
            this.logger.warn(
                'Failed to write the AI service account audit event',
                redactCredentialError(error),
            );
        }
    }

    async get(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
    ): Promise<AiServiceAccountSlot | null> {
        const { warehouseConnectionUuid } = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            false,
        );
        return this.deps.aiServiceAccountCredentialsModel.getSlot(
            projectUuid,
            warehouseConnectionUuid,
        );
    }

    async getStatus(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
    ): Promise<{
        results: AiServiceAccountSlot | null;
        parent: AiServiceAccountParent | null;
    }> {
        const { warehouseConnectionUuid, organizationUuid } =
            await this.loadConnection(
                account,
                projectUuid,
                connectionUuid,
                false,
            );
        const results =
            await this.deps.aiServiceAccountCredentialsModel.getSlot(
                projectUuid,
                warehouseConnectionUuid,
            );
        const resolver = new AiServiceAccountSlotResolver(this.deps);
        const input = { projectUuid, connection: warehouseConnectionUuid };
        const inherited = await resolver
            .resolveParent(input)
            .catch(async (error) => {
                if (!(error instanceof AiServiceAccountSlotResolutionError))
                    throw error;
                const metadata = await resolver.resolveParentMetadata(input);
                return metadata === null
                    ? null
                    : {
                          ...metadata,
                          slot: { slot: metadata.slot, secrets: null },
                      };
            });
        if (inherited === null) return { results, parent: null };
        const parentUuid = inherited.sourceProjectUuid;
        const canView = this.createAuditedAbility(account).can(
            'view',
            subject('Project', { organizationUuid, projectUuid: parentUuid }),
        );
        return {
            results,
            parent: {
                projectUuid: parentUuid,
                projectName: canView
                    ? (await this.deps.projectModel.getSummary(parentUuid)).name
                    : null,
                identityUuid: inherited.slot.slot.identityUuid,
                principal:
                    inherited.slot.secrets?.keyfileContents.client_email ??
                    null,
            },
        };
    }

    async upsert(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        input: AiServiceAccountCredentialInput,
    ): Promise<AiServiceAccountSlot> {
        const {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        } = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            true,
        );
        if (input.type !== connection.type)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        const saved =
            await this.deps.aiServiceAccountCredentialsModel.getReplaceableSecrets(
                projectUuid,
                warehouseConnectionUuid,
            );
        const merged = mergeAiServiceAccountCredentials(input, saved);
        const { stored: credentials } =
            await aiServiceAccountCredentialResolvers.validateOnSave(
                {
                    connection,
                    stored: merged,
                    owner: null,
                    context: connectionContextFromAccount(account, {
                        organizationUuid,
                        queryContext: QueryExecutionContext.API,
                    }),
                    projectUuid,
                    warehouseConnectionUuid,
                    credentialKind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
                    aiPlan: null,
                    intent: { kind: 'preserve' },
                },
                'ai_service_account',
            );
        const previous =
            await this.deps.aiServiceAccountCredentialsModel.getSlot(
                projectUuid,
                warehouseConnectionUuid,
            );
        const slot = await this.deps.aiServiceAccountCredentialsModel.upsert(
            projectUuid,
            warehouseConnectionUuid,
            credentials,
            account.user.id,
        );
        this.recordChange(
            account,
            previous === null ? 'create' : 'update',
            projectUuid,
            organizationUuid,
            {
                event: 'agent_identity.service_account_saved',
                warehouseConnectionUuid,
                connectionName,
                previousGeneration: previous?.identityUuid ?? null,
                generation: slot.identityUuid,
                inheritedFromProjectUuid: null,
                result: null,
            },
        );
        trackSafely(() =>
            this.deps.analytics.track({
                event: 'agent_identity.service_account_saved',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    userId: account.user.id,
                    warehouseType: connection.type,
                    operation: previous === null ? 'created' : 'updated',
                },
            }),
        );
        return slot;
    }

    async delete(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
    ): Promise<void> {
        const {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        } = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            true,
        );
        const previous =
            await this.deps.aiServiceAccountCredentialsModel.getSlot(
                projectUuid,
                warehouseConnectionUuid,
            );
        await this.deps.aiServiceAccountCredentialsModel.delete(
            projectUuid,
            warehouseConnectionUuid,
        );
        this.recordChange(account, 'delete', projectUuid, organizationUuid, {
            event: 'agent_identity.service_account_deleted',
            warehouseConnectionUuid,
            connectionName,
            previousGeneration: previous?.identityUuid ?? null,
            generation: null,
            inheritedFromProjectUuid: null,
            result: null,
        });
        trackSafely(() =>
            this.deps.analytics.track({
                event: 'agent_identity.service_account_deleted',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    userId: account.user.id,
                    warehouseType: connection.type,
                },
            }),
        );
    }

    async testAccess(
        account: Account,
        projectUuid: UUID,
        connectionUuid: UUID | null,
        request: AgentAccessTestRequest,
    ): Promise<AgentAccessReport> {
        const loaded = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            false,
        );
        return testAgentAccess(
            { account, projectUuid, request, ...loaded },
            {
                ...this.deps,
                warehouseClientFactory:
                    this.deps.projectService.warehouseClientFactory,
            },
        );
    }

    async test(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        input: AiServiceAccountCredentialInput | null,
    ): Promise<AiServiceAccountTestResult> {
        const {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        } = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            true,
        );
        if (input !== null && input.type !== connection.type)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        let secrets =
            input === null
                ? null
                : mergeAiServiceAccountCredentials(
                      input,
                      await this.deps.aiServiceAccountCredentialsModel.getReplaceableSecrets(
                          projectUuid,
                          warehouseConnectionUuid,
                      ),
                  );
        const slot = await this.deps.aiServiceAccountCredentialsModel.getSlot(
            projectUuid,
            warehouseConnectionUuid,
        );
        const sql = 'SELECT SESSION_USER() AS principal';
        let queryStarted = false;
        let inheritedFromProjectUuid: string | null = null;
        let testedGeneration =
            input === null ? null : (slot?.identityUuid ?? null);
        let result: AiServiceAccountTestResult;
        let failureReason: 'connection_failed' | 'query_failed' | null = null;
        try {
            if (input === null) {
                const resolved = await new AiServiceAccountSlotResolver(
                    this.deps,
                ).resolve({ projectUuid, connection: warehouseConnectionUuid });
                secrets = resolved?.slot.secrets ?? null;
                testedGeneration = resolved?.slot.slot.identityUuid ?? null;
                inheritedFromProjectUuid = resolved?.inherited
                    ? resolved.sourceProjectUuid
                    : null;
            }
            if (secrets === null) {
                throw new NotFoundError(
                    'The connection has no AI service account.',
                );
            }
            const credentials = buildAiServiceAccountCredentials(
                connection,
                secrets,
            );
            const { rows } =
                await this.deps.projectService.warehouseClientFactory.withWarehouseClient(
                    {
                        kind: 'bypass',
                        mode: 'connection_test',
                        agentSession: true,
                        projectUuid,
                        credentials,
                    },
                    connectionContextFromAccount(account, {
                        organizationUuid,
                        queryContext: QueryExecutionContext.API,
                    }),
                    ({ warehouseClient }) => {
                        queryStarted = true;
                        return warehouseClient.runQuery(sql, {});
                    },
                );
            const row = rows[0];
            const principalValue: unknown = row?.principal ?? row?.PRINCIPAL;
            const principal =
                typeof principalValue === 'string' ? principalValue : null;
            const observed: Record<string, string | null> = { principal };
            result = {
                ok: true,
                principal,
                observed,
                message:
                    principal === null
                        ? 'Connection checked; principal not observed.'
                        : 'AI service account connection checked.',
                checkedAt: new Date(),
            };
        } catch (error) {
            if (error instanceof AiServiceAccountSlotResolutionError)
                inheritedFromProjectUuid = error.inheritedFromProjectUuid;
            if (secrets === null && error instanceof NotFoundError) throw error;
            failureReason = queryStarted ? 'query_failed' : 'connection_failed';
            this.logger.warn('AI service account test failed', {
                userUuid: account.user.id,
                organizationUuid,
                projectUuid,
                warehouseConnectionUuid,
                reason: failureReason,
                ...redactCredentialError(error),
            });
            result = {
                ok: false,
                principal: null,
                observed: {},
                message:
                    'Could not verify the AI service account. Check the credentials and connection settings.',
                checkedAt: new Date(),
            };
        }
        this.recordChange(account, 'test', projectUuid, organizationUuid, {
            event: 'agent_identity.service_account_tested',
            warehouseConnectionUuid,
            connectionName,
            previousGeneration: testedGeneration,
            generation: testedGeneration,
            inheritedFromProjectUuid,
            result: result.ok ? 'success' : 'failure',
        });
        trackSafely(() =>
            this.deps.analytics.track({
                event: 'agent_identity.service_account_tested',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    userId: account.user.id,
                    warehouseType: connection.type,
                    result: result.ok ? 'success' : 'failure',
                    failureReason,
                    credentialSource: input === null ? 'saved' : 'submitted',
                    inheritedFromProjectUuid,
                },
            }),
        );
        return result;
    }
}
