import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
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
import { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { type AiRouterModel } from '../../models/AiRouterModel';
import { selectAgent } from '../ai/agents/agentSelector';
import { getModel } from '../ai/models';
import { type AiAgentService } from '../AiAgentService/AiAgentService';

type Deps = {
    lightdashConfig: LightdashConfig;
    aiRouterModel: AiRouterModel;
    aiAgentService: AiAgentService;
};

export class AiRouterService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly aiRouterModel: AiRouterModel;

    private readonly aiAgentService: AiAgentService;

    constructor({ lightdashConfig, aiRouterModel, aiAgentService }: Deps) {
        super({ serviceName: 'AiRouterService' });
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
            ability.cannot('manage', subject('AiAgent', { organizationUuid }))
        ) {
            throw new ForbiddenError();
        }
    }

    private assertViewAiAgent(
        account: RegisteredAccount,
        organizationUuid: string,
    ): void {
        const ability = this.createAuditedAbility(account);
        if (ability.cannot('view', subject('AiAgent', { organizationUuid }))) {
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
        return this.aiRouterModel.upsert({
            organizationUuid,
            enabled: body.enabled,
            projectUuids: body.projectUuids,
        });
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

        return this.aiRouterModel.createInstructionVersion({
            routerUuid: router.routerUuid,
            projectUuid,
            instruction: body.instruction,
            taggedAgentUuids: body.taggedAgentUuids,
        });
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

        const router = await this.getEnabledRouter(organizationUuid);

        const candidates = await this.aiAgentService.getAvailableAgents(
            organizationUuid,
            account.user.userUuid,
            { aiRequireOAuth: true },
            { projectFilter: { projectUuid } },
        );

        if (candidates.length < 2) {
            throw new ParameterError(
                'AI router requires at least two accessible agents',
            );
        }

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

        const nextAction =
            brain.confidence === 'high' && !brain.shouldSkipForwardingQuery
                ? 'create_thread'
                : 'show_picker';

        const decision = await this.aiRouterModel.createDecision({
            routerUuid: router.routerUuid,
            userUuid: account.user.userUuid,
            prompt,
            suggestedAgentUuid: brain.selectedAgentUuid,
            confidence: brain.confidence,
            reasoning: brain.reasoning,
            candidateAgentUuids: candidates.map((c) => c.uuid),
        });

        return {
            decision: {
                decisionUuid: decision.decisionUuid,
                suggestedAgentUuid: brain.selectedAgentUuid,
                confidence: brain.confidence,
                reasoning: brain.reasoning,
                candidates: candidates.map((c) => ({
                    agentUuid: c.uuid,
                    name: c.name,
                    description: c.description ?? null,
                })),
            },
            nextAction,
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
