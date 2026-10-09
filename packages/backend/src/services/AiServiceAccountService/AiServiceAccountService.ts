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
    type AiServiceAccountCredentialInput,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { trackSafely } from '../../analytics/trackSafely';
import { type AiServiceAccountCredentialsModel } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import { type ProjectService } from '../ProjectService/ProjectService';
import { connectionContextFromAccount } from '../WarehouseClientFactory/ConnectionContext';
import {
    applyAiServiceAccountCredentials,
    mergeAiServiceAccountCredentials,
} from './applyAiServiceAccountCredentials';

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
    ) {
        assertIsAccountWithOrg(account);
        const { organizationUuid } =
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
        if (warehouseConnectionUuid !== null) {
            const project =
                await this.deps.warehouseConnectionModel.getProject(
                    projectUuid,
                );
            const connection = await this.deps.warehouseConnectionModel.get(
                project,
                warehouseConnectionUuid,
            );
            if (connection.isOriginal) warehouseConnectionUuid = null;
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
        return { connection, warehouseConnectionUuid, organizationUuid };
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
        );
        return this.deps.aiServiceAccountCredentialsModel.getSlot(
            projectUuid,
            warehouseConnectionUuid,
        );
    }

    async upsert(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        input: AiServiceAccountCredentialInput,
    ): Promise<AiServiceAccountSlot> {
        const { connection, warehouseConnectionUuid, organizationUuid } =
            await this.loadConnection(account, projectUuid, connectionUuid);
        if (input.type !== connection.type)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        const saved =
            await this.deps.aiServiceAccountCredentialsModel.getReplaceableSecrets(
                projectUuid,
                warehouseConnectionUuid,
            );
        const credentials = mergeAiServiceAccountCredentials(input, saved);
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
        const { connection, warehouseConnectionUuid, organizationUuid } =
            await this.loadConnection(account, projectUuid, connectionUuid);
        await this.deps.aiServiceAccountCredentialsModel.delete(
            projectUuid,
            warehouseConnectionUuid,
        );
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

    async test(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        input: AiServiceAccountCredentialInput | null,
    ): Promise<AiServiceAccountTestResult> {
        const { connection, warehouseConnectionUuid, organizationUuid } =
            await this.loadConnection(account, projectUuid, connectionUuid);
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
        const sql = 'SELECT SESSION_USER() AS principal';
        let queryStarted = false;
        let result: AiServiceAccountTestResult;
        let failureReason: 'connection_failed' | 'query_failed' | null = null;
        try {
            if (input === null) {
                secrets =
                    await this.deps.aiServiceAccountCredentialsModel.getSecrets(
                        projectUuid,
                        warehouseConnectionUuid,
                    );
            }
            if (secrets === null) {
                throw new NotFoundError(
                    'The connection has no AI service account.',
                );
            }
            const credentials = applyAiServiceAccountCredentials(
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
            if (secrets === null && error instanceof NotFoundError) throw error;
            failureReason = queryStarted ? 'query_failed' : 'connection_failed';
            result = {
                ok: false,
                principal: null,
                observed: {},
                message:
                    'Could not verify the AI service account. Check the credentials and connection settings.',
                checkedAt: new Date(),
            };
        }
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
                },
            }),
        );
        return result;
    }
}
