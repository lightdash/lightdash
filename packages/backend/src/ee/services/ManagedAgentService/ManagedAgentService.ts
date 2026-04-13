import {
    ManagedAgentActionType,
    ManagedAgentTargetType,
    type ManagedAgentAction,
    type ManagedAgentActionFilters,
    type ManagedAgentSettings,
    type UpdateManagedAgentSettings,
} from '@lightdash/common';
import type { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { ManagedAgentClient } from '../../clients/ManagedAgentClient';
import { ManagedAgentModel } from '../../models/ManagedAgentModel';

type ManagedAgentServiceDependencies = {
    lightdashConfig: LightdashConfig;
    managedAgentModel: ManagedAgentModel;
};

export class ManagedAgentService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly managedAgentModel: ManagedAgentModel;

    private client: ManagedAgentClient | null = null;

    constructor(deps: ManagedAgentServiceDependencies) {
        super();
        this.lightdashConfig = deps.lightdashConfig;
        this.managedAgentModel = deps.managedAgentModel;
    }

    private getClient(): ManagedAgentClient {
        if (!this.client) {
            const { anthropicApiKey, serviceAccountPat } =
                this.lightdashConfig.managedAgent;
            if (!anthropicApiKey) {
                throw new Error(
                    'ANTHROPIC_API_KEY is required for managed agent',
                );
            }
            this.client = new ManagedAgentClient({
                anthropicApiKey,
                siteUrl: this.lightdashConfig.siteUrl,
                serviceAccountPat: serviceAccountPat ?? '',
            });
        }
        return this.client;
    }

    // --- Settings API ---

    async getSettings(
        projectUuid: string,
    ): Promise<ManagedAgentSettings | null> {
        return this.managedAgentModel.getSettings(projectUuid);
    }

    async updateSettings(
        projectUuid: string,
        userUuid: string,
        update: UpdateManagedAgentSettings,
    ): Promise<ManagedAgentSettings> {
        return this.managedAgentModel.upsertSettings(
            projectUuid,
            userUuid,
            update,
        );
    }

    async getEnabledProjects(): Promise<ManagedAgentSettings[]> {
        return this.managedAgentModel.getEnabledProjects();
    }

    // --- Actions API ---

    async getActions(
        projectUuid: string,
        filters: ManagedAgentActionFilters = {},
    ): Promise<ManagedAgentAction[]> {
        return this.managedAgentModel.getActions(projectUuid, filters);
    }

    async reverseAction(
        actionUuid: string,
        userUuid: string,
    ): Promise<ManagedAgentAction> {
        const action = await this.managedAgentModel.getAction(actionUuid);
        if (!action) {
            throw new Error(`Action ${actionUuid} not found`);
        }
        if (action.reversedAt) {
            throw new Error(`Action ${actionUuid} already reversed`);
        }
        // For now, just mark as reversed in the action log.
        // Full reversal (restore soft-deleted content, delete agent-created content)
        // will be wired when we have the service dependencies in place.
        return this.managedAgentModel.reverseAction(actionUuid, userUuid);
    }

    // --- Heartbeat ---

    async runHeartbeat(projectUuid: string): Promise<void> {
        const settings = await this.managedAgentModel.getSettings(projectUuid);
        if (!settings?.enabled) {
            return;
        }

        this.logger.info(`Running heartbeat for project: ${projectUuid}`);

        const client = this.getClient();
        let sessionId = '';

        const onToolCall = async (
            toolName: string,
            input: Record<string, unknown>,
        ): Promise<string> =>
            this.handleToolCall(projectUuid, sessionId, toolName, input);

        sessionId = await client.runSession(projectUuid, onToolCall);

        this.logger.info(`Heartbeat complete for project: ${projectUuid}`);
    }

    // --- Tool Handlers ---

    private async handleToolCall(
        projectUuid: string,
        sessionId: string,
        toolName: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        switch (toolName) {
            case 'get_recent_actions':
                return this.handleGetRecentActions(
                    projectUuid,
                    input.limit as number | undefined,
                );
            case 'get_stale_charts':
            case 'get_stale_dashboards':
            case 'get_broken_content':
            case 'get_preview_projects':
            case 'get_popular_content':
                // These read tools will be wired to actual model queries in Task 10.
                // For now, return empty arrays so the agent can run end-to-end.
                return JSON.stringify([]);
            case 'flag_content':
                return this.handleFlagContent(projectUuid, sessionId, input);
            case 'soft_delete_content':
                return this.handleSoftDelete(projectUuid, sessionId, input);
            case 'log_insight':
                return this.handleLogInsight(projectUuid, sessionId, input);
            case 'create_content_from_code':
                // Content creation will be wired when CoderService integration is ready.
                return JSON.stringify({
                    error: 'Content creation not yet implemented',
                });
            default:
                return JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
    }

    private async handleGetRecentActions(
        projectUuid: string,
        limit?: number,
    ): Promise<string> {
        const actions = await this.managedAgentModel.getRecentActions(
            projectUuid,
            limit ?? 50,
        );
        return JSON.stringify(
            actions.map((a) => ({
                action_uuid: a.actionUuid,
                action_type: a.actionType,
                target_name: a.targetName,
                target_type: a.targetType,
                description: a.description,
                reversed: a.reversedAt !== null,
                created_at: a.createdAt.toISOString(),
            })),
        );
    }

    private async handleFlagContent(
        projectUuid: string,
        sessionId: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            actionType: input.flag_type as ManagedAgentActionType,
            targetType: input.target_type as ManagedAgentTargetType,
            targetUuid: input.target_uuid as string,
            targetName: input.target_name as string,
            description: input.description as string,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({ action_uuid: action.actionUuid });
    }

    private async handleSoftDelete(
        projectUuid: string,
        sessionId: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        // For now, just log the action. Actual soft delete will be wired
        // when service dependencies (SavedChartService, DashboardService) are available.
        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            actionType: ManagedAgentActionType.SOFT_DELETED,
            targetType: input.target_type as ManagedAgentTargetType,
            targetUuid: input.target_uuid as string,
            targetName: input.target_name as string,
            description: input.description as string,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({
            action_uuid: action.actionUuid,
            recoverable: true,
        });
    }

    private async handleLogInsight(
        projectUuid: string,
        sessionId: string,
        input: Record<string, unknown>,
    ): Promise<string> {
        const action = await this.managedAgentModel.createAction({
            projectUuid,
            sessionId,
            actionType: ManagedAgentActionType.INSIGHT,
            targetType: input.target_type as ManagedAgentTargetType,
            targetUuid: input.target_uuid as string,
            targetName: input.target_name as string,
            description: input.description as string,
            metadata: (input.metadata as Record<string, unknown>) ?? {},
        });
        return JSON.stringify({ action_uuid: action.actionUuid });
    }
}
