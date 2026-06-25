import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type AiAgentWithContext,
    type AiRouter,
    type AiRouterDecision,
    type AiRouterDecisionListFilters,
    type AiRouterInstruction,
    type AiRouterRouteResponseResult,
    type AiRouterSelectionMode,
    type RegisteredAccount,
    type UpsertAiRouterInstructionRequest,
    type UpsertAiRouterRequest,
} from '@lightdash/common';
import {
    type AiRouterConfigUpdatedEvent,
    type AiRouterInstructionsUpdatedEvent,
    type AiRouterMessageRoutedEvent,
    type LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { type AiRouterModel } from '../../models/AiRouterModel';
import { selectAgent } from '../ai/agents/agentSelector';
import { getModel } from '../ai/models';
import { type AiAgentService } from '../AiAgentService/AiAgentService';

type Deps = {
    analytics: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    aiRouterModel: AiRouterModel;
    aiAgentService: AiAgentService;
};

type RoutePromptMode = 'web' | 'mcp';

type PromptRouteSelection = {
    candidates: AiAgentWithContext[];
    suggestedAgent: AiAgentWithContext;
    routerUuid: string | null;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
    shouldSkipForwardingQuery: boolean;
    nextAction: 'create_thread' | 'show_picker';
};

export class AiRouterService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly aiRouterModel: AiRouterModel;

    private readonly aiAgentService: AiAgentService;

    constructor({
        analytics,
        lightdashConfig,
        aiRouterModel,
        aiAgentService,
    }: Deps) {
        super({ serviceName: 'AiRouterService' });
        this.analytics = analytics;
        this.lightdashConfig = lightdashConfig;
        this.aiRouterModel = aiRouterModel;
        this.aiAgentService = aiAgentService;
    }

    private static organizationUuidOf(account: RegisteredAccount): string {
        const organizationUuid = account.organization?.organizationUuid;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not a member of an organization');
        }
        return organizationUuid;
    }

    private assertManageAiAgent(
        account: RegisteredAccount,
        organizationUuid: string,
    ): void {
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('OrganizationAiAgent', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private assertViewAiAgent(
        account: RegisteredAccount,
        organizationUuid: string,
    ): void {
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'view',
                subject('OrganizationAiAgent', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async getEnabledRouter(
        organizationUuid: string,
    ): Promise<AiRouter> {
        const router =
            await this.aiRouterModel.findByOrganization(organizationUuid);
        if (!router || !router.enabled) {
            throw new NotFoundError('AI router is not enabled');
        }
        return router;
    }

    public async routePromptToAgent(
        account: RegisteredAccount,
        {
            prompt,
            projectUuid,
            mode,
        }: {
            prompt: string;
            projectUuid: string;
            mode: RoutePromptMode;
        },
    ): Promise<PromptRouteSelection> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertViewAiAgent(account, organizationUuid);

        const candidates = await this.aiAgentService.getAvailableAgents(
            organizationUuid,
            account.user.userUuid,
            { aiRequireOAuth: true },
            { projectFilter: { projectUuid } },
        );

        if (candidates.length === 0) {
            throw new ParameterError(
                'No accessible AI agents are available for this project',
            );
        }

        // The web routing UI is short-circuited when fewer than two agents are
        // accessible, so the web endpoint keeps requiring at least two. MCP has
        // no such picker, so a sole agent is routed to directly.
        if (mode === 'web' && candidates.length < 2) {
            throw new ParameterError(
                'AI router requires at least two accessible agents',
            );
        }

        if (candidates.length === 1) {
            return {
                candidates,
                suggestedAgent: candidates[0],
                routerUuid: null,
                confidence: 'high',
                reasoning: 'Only one agent available',
                shouldSkipForwardingQuery: false,
                nextAction: 'create_thread',
            };
        }

        const router = await this.getEnabledRouter(organizationUuid);
        const instruction = await this.aiRouterModel.getLatestInstruction({
            routerUuid: router.routerUuid,
            projectUuid,
        });

        const { model } = getModel(this.lightdashConfig.ai.copilot);
        const brain = await selectAgent({
            model,
            candidates,
            prompt,
            instructions: instruction?.instruction ?? null,
        });

        const suggestedAgent =
            candidates.find(
                (candidate) => candidate.uuid === brain.selectedAgentUuid,
            ) ?? candidates[0];

        return {
            candidates,
            suggestedAgent,
            routerUuid: router.routerUuid,
            confidence: brain.confidence,
            reasoning: brain.reasoning,
            shouldSkipForwardingQuery: brain.shouldSkipForwardingQuery,
            nextAction:
                mode === 'mcp' ||
                (brain.confidence === 'high' &&
                    !brain.shouldSkipForwardingQuery)
                    ? 'create_thread'
                    : 'show_picker',
        };
    }

    async getConfig(account: RegisteredAccount): Promise<AiRouter> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertManageAiAgent(account, organizationUuid);
        const router =
            await this.aiRouterModel.findByOrganization(organizationUuid);
        if (!router) {
            throw new NotFoundError('AI router not configured');
        }
        return router;
    }

    async upsertConfig(
        account: RegisteredAccount,
        body: UpsertAiRouterRequest,
    ): Promise<AiRouter> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertManageAiAgent(account, organizationUuid);
        const router = await this.aiRouterModel.upsert({
            organizationUuid,
            enabled: body.enabled,
            projectUuids: body.projectUuids,
        });

        this.analytics.track<AiRouterConfigUpdatedEvent>({
            event: 'ai_router.config_updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                enabled: router.enabled,
                projectsCount: router.projectUuids.length,
            },
        });

        return router;
    }

    async getInstruction(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<AiRouterInstruction | null> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertManageAiAgent(account, organizationUuid);
        const router =
            await this.aiRouterModel.findByOrganization(organizationUuid);
        if (!router) {
            return null;
        }
        return this.aiRouterModel.getLatestInstruction({
            routerUuid: router.routerUuid,
            projectUuid,
        });
    }

    /**
     * Writes a new routing-instruction version for a project. The router row is
     * created lazily on first save, mirroring {@link upsertConfig}. Tagged agents
     * are validated against the project so a rule can never reference an agent
     * outside the project it routes within.
     */
    async upsertInstruction(
        account: RegisteredAccount,
        projectUuid: string,
        body: UpsertAiRouterInstructionRequest,
    ): Promise<AiRouterInstruction> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertManageAiAgent(account, organizationUuid);

        if (body.taggedAgentUuids.length > 0) {
            const projectAgents = await this.aiAgentService.getAvailableAgents(
                organizationUuid,
                account.user.userUuid,
                { aiRequireOAuth: false },
                { projectFilter: { projectUuid } },
            );
            const projectAgentUuids = new Set(
                projectAgents.map((agent) => agent.uuid),
            );
            const invalid = body.taggedAgentUuids.filter(
                (agentUuid) => !projectAgentUuids.has(agentUuid),
            );
            if (invalid.length > 0) {
                throw new ParameterError(
                    `Tagged agents do not belong to this project: ${invalid.join(
                        ', ',
                    )}`,
                );
            }
        }

        const router = await this.aiRouterModel.upsert({ organizationUuid });

        const instruction = await this.aiRouterModel.createInstructionVersion({
            routerUuid: router.routerUuid,
            projectUuid,
            instruction: body.instruction,
            taggedAgentUuids: body.taggedAgentUuids,
        });

        this.analytics.track<AiRouterInstructionsUpdatedEvent>({
            event: 'ai_router.instructions_updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                instructionLength: body.instruction.length,
                taggedAgentsCount: body.taggedAgentUuids.length,
            },
        });

        return instruction;
    }

    async listDecisions(
        account: RegisteredAccount,
        filters?: AiRouterDecisionListFilters,
    ): Promise<AiRouterDecision[]> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertManageAiAgent(account, organizationUuid);
        const router =
            await this.aiRouterModel.findByOrganization(organizationUuid);
        if (!router) return [];
        return this.aiRouterModel.listDecisions({
            routerUuid: router.routerUuid,
            filters,
        });
    }

    /**
     * Runs the router for a prompt and persists a pending decision row.
     * The caller must follow up with {@link commitDecision} once the thread
     * is created (or never, in which case the row stays uncommitted and
     * serves as an abandonment signal).
     *
     * Requires at least two candidate agents — the frontend short-circuits
     * the routing UI when there are zero or one accessible agents in scope.
     */
    async route(
        account: RegisteredAccount,
        { prompt, projectUuid }: { prompt: string; projectUuid: string },
    ): Promise<AiRouterRouteResponseResult> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertViewAiAgent(account, organizationUuid);
        const selection = await this.routePromptToAgent(account, {
            prompt,
            projectUuid,
            mode: 'web',
        });
        // Web routing requires at least two agents, so it always runs through an
        // enabled router and never hits the single-agent fast-path that returns
        // a null routerUuid.
        if (!selection.routerUuid) {
            throw new NotFoundError('AI router is not enabled');
        }

        const decision = await this.aiRouterModel.createDecision({
            routerUuid: selection.routerUuid,
            userUuid: account.user.userUuid,
            prompt,
            suggestedAgentUuid: selection.suggestedAgent.uuid,
            confidence: selection.confidence,
            reasoning: selection.reasoning,
            candidateAgentUuids: selection.candidates.map((c) => c.uuid),
        });

        this.analytics.track<AiRouterMessageRoutedEvent>({
            event: 'ai_router.message_routed',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                confidence: selection.confidence,
                nextAction: selection.nextAction,
                candidatesCount: selection.candidates.length,
            },
        });

        return {
            decision: {
                decisionUuid: decision.decisionUuid,
                suggestedAgentUuid: selection.suggestedAgent.uuid,
                confidence: selection.confidence,
                reasoning: selection.reasoning,
                candidates: selection.candidates.map((c) => ({
                    agentUuid: c.uuid,
                    name: c.name,
                    description: c.description ?? null,
                })),
            },
            nextAction: selection.nextAction,
        };
    }

    /**
     * Commits a pending decision once the user has resolved it (router
     * auto-routed and the thread is created, or the user picked an agent
     * from the picker). Sets the chosen agent, thread linkage, and
     * derives the selection_mode from the recorded confidence.
     */
    async commitDecision(
        account: RegisteredAccount,
        decisionUuid: string,
        {
            chosenAgentUuid,
            threadUuid,
        }: {
            chosenAgentUuid: string;
            threadUuid: string;
        },
    ): Promise<void> {
        const organizationUuid = AiRouterService.organizationUuidOf(account);
        this.assertViewAiAgent(account, organizationUuid);

        const decision = await this.aiRouterModel.getDecision(decisionUuid);
        if (decision.userUuid !== account.user.userUuid) {
            throw new ForbiddenError();
        }
        const router =
            await this.aiRouterModel.findByOrganization(organizationUuid);
        if (!router || router.routerUuid !== decision.routerUuid) {
            throw new ForbiddenError();
        }

        if (!decision.candidateAgentUuids.includes(chosenAgentUuid)) {
            throw new ParameterError(
                'Chosen agent was not among the routing candidates',
            );
        }

        const selectionMode: AiRouterSelectionMode =
            decision.confidence === 'high' &&
            chosenAgentUuid === decision.suggestedAgentUuid
                ? 'auto_routed'
                : 'manual_pick';

        await this.aiRouterModel.commitDecision({
            decisionUuid,
            chosenAgentUuid,
            threadUuid,
            selectionMode,
        });
    }
}
