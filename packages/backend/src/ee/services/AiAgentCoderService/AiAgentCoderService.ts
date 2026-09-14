import { subject } from '@casl/ability';
import {
    CONTENT_AS_CODE_VERSIONS,
    ContentAsCodeType,
    exceedsRetentionCeiling,
    ForbiddenError,
    isValidRetentionWindowHours,
    ParameterError,
    RETENTION_WINDOW_HOURS_ERROR,
    type AgentAsCode,
    type AgentAsCodeEvaluation,
    type AgentAsCodeUpsertChanges,
    type SessionUser,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { validate as isValidUuid } from 'uuid';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import { paginateAsCode } from '../../../services/CoderService/pagination';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { type AiOrganizationSettingsService } from '../AiOrganizationSettingsService';

const AGENT_AS_CODE_VERSION = CONTENT_AS_CODE_VERSIONS.ai_agent;
const AGENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type AgentForCode = Awaited<
    ReturnType<AiAgentModel['findAgentsForCode']>
>[number];

type EvaluationForCode = Awaited<
    ReturnType<AiAgentModel['findAgentEvalsForCode']>
>[number];

const normalizeEvaluation = (
    evaluation: AgentAsCodeEvaluation,
): AgentAsCodeEvaluation => ({
    title: evaluation.title,
    prompts: [...evaluation.prompts].sort(
        (left, right) =>
            left.prompt.localeCompare(right.prompt) ||
            (left.expectedResponse ?? '').localeCompare(
                right.expectedResponse ?? '',
            ),
    ),
});

const groupEvaluationsByAgentUuid = (
    evaluations: EvaluationForCode[],
): Map<string, EvaluationForCode[]> =>
    evaluations.reduce<Map<string, EvaluationForCode[]>>((grouped, item) => {
        grouped.set(item.agentUuid, [
            ...(grouped.get(item.agentUuid) ?? []),
            item,
        ]);
        return grouped;
    }, new Map());

const toAgentAsCode = (
    agent: AgentForCode,
    evaluations: EvaluationForCode[],
): AgentAsCode => ({
    contentType: ContentAsCodeType.AI_AGENT,
    version: AGENT_AS_CODE_VERSION,
    agentVersion: agent.agentVersion,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    imageUrl: agent.imageUrl,
    instruction: agent.instruction || null,
    tags: agent.tags ? [...agent.tags].sort() : null,
    enableDataAccess: agent.enableDataAccess,
    enableSelfImprovement: agent.enableSelfImprovement,
    enableContentTools: agent.enableContentTools,
    enableUserContext: agent.enableUserContext,
    enableSqlMode: agent.enableSqlMode,
    // Omit rather than export null: a dumped `threadRetentionHours: null` in
    // every YAML would trip the flag-off warning on each re-upload.
    threadRetentionHours: agent.threadRetentionHours ?? undefined,
    modelConfig: agent.modelConfig,
    evaluations: [...evaluations]
        .sort((left, right) => left.title.localeCompare(right.title))
        .map(normalizeEvaluation),
    updatedAt: agent.updatedAt,
});

// Retention joins the comparison only when the org flag is on AND the
// document declares it — an omitted field means "not managed", so a stored
// value must not look like a diff.
const getComparableAgent = (
    agent: AgentAsCode,
    includeThreadRetention: boolean,
) => ({
    agentVersion: agent.agentVersion,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    imageUrl: agent.imageUrl,
    instruction: agent.instruction || null,
    tags: agent.tags ? [...agent.tags].sort() : null,
    enableDataAccess: agent.enableDataAccess,
    enableSelfImprovement: agent.enableSelfImprovement,
    enableContentTools: agent.enableContentTools,
    enableUserContext: agent.enableUserContext,
    enableSqlMode: agent.enableSqlMode ?? true,
    ...(includeThreadRetention
        ? { threadRetentionHours: agent.threadRetentionHours ?? null }
        : {}),
    modelConfig: agent.modelConfig,
});

type Dependencies = {
    aiAgentModel: AiAgentModel;
    projectModel: ProjectModel;
    lightdashConfig: LightdashConfig;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
};

export class AiAgentCoderService extends BaseService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly projectModel: ProjectModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly aiOrganizationSettingsService: AiOrganizationSettingsService;

    constructor({
        aiAgentModel,
        projectModel,
        lightdashConfig,
        aiOrganizationSettingsService,
    }: Dependencies) {
        super({ serviceName: 'AiAgentCoderService' });
        this.aiAgentModel = aiAgentModel;
        this.projectModel = projectModel;
        this.lightdashConfig = lightdashConfig;
        this.aiOrganizationSettingsService = aiOrganizationSettingsService;
    }

    private async getProjectOrganizationUuid(
        projectUuid: string,
    ): Promise<string> {
        const project = await this.projectModel.getSummary(projectUuid);
        return project.organizationUuid;
    }

    private async assertCanDownloadAgents(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const organizationUuid =
            await this.getProjectOrganizationUuid(projectUuid);
        const ability = this.createAuditedAbility(user);

        if (
            ability.cannot(
                'view',
                subject('ContentAsCode', { organizationUuid, projectUuid }),
            ) ||
            ability.cannot(
                'manage',
                subject('AiAgent', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download AI agents as code',
            );
        }

        return organizationUuid;
    }

    private async assertCanUploadAgents(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const organizationUuid =
            await this.getProjectOrganizationUuid(projectUuid);
        const ability = this.createAuditedAbility(user);

        if (
            ability.cannot(
                'manage',
                subject('ContentAsCode', { organizationUuid, projectUuid }),
            ) ||
            ability.cannot(
                'manage',
                subject('AiAgent', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to upload AI agents as code',
            );
        }

        return organizationUuid;
    }

    async downloadAgents(
        user: SessionUser,
        projectUuid: string,
        ids?: string[],
        offset?: number,
    ): Promise<{
        agents: AgentAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    }> {
        const organizationUuid = await this.assertCanDownloadAgents(
            user,
            projectUuid,
        );
        const agentUuids = ids?.filter(isValidUuid) ?? [];
        const slugs = ids ?? [];
        const agents = await this.aiAgentModel.findAgentsForCode({
            organizationUuid,
            projectUuid,
            slugs: slugs.length > 0 ? slugs : undefined,
            agentUuids: agentUuids.length > 0 ? agentUuids : undefined,
        });
        const missingIds =
            ids?.filter(
                (id) =>
                    !agents.some(
                        (agent) => agent.slug === id || agent.uuid === id,
                    ),
            ) ?? [];
        const page = paginateAsCode({
            items: agents,
            offset,
            pageSize: this.lightdashConfig.contentAsCode.maxDownloads,
        });
        const evaluations = await this.aiAgentModel.findAgentEvalsForCode(
            page.page.map(({ uuid }) => uuid),
        );
        const evaluationsByAgentUuid = groupEvaluationsByAgentUuid(evaluations);

        return {
            agents: page.page.map((agent) =>
                toAgentAsCode(
                    agent,
                    evaluationsByAgentUuid.get(agent.uuid) ?? [],
                ),
            ),
            missingIds,
            total: page.total,
            offset: page.offset,
        };
    }

    async upsertAgents(
        user: SessionUser,
        projectUuid: string,
        agents: AgentAsCode[],
        force = false,
    ): Promise<AgentAsCodeUpsertChanges> {
        const organizationUuid = await this.assertCanUploadAgents(
            user,
            projectUuid,
        );
        const duplicateSlugs = agents
            .map(({ slug }) => slug)
            .filter((slug, index, slugs) => slugs.indexOf(slug) !== index);

        if (duplicateSlugs.length > 0) {
            throw new ParameterError(
                `Duplicate AI agent slugs in upload: ${[
                    ...new Set(duplicateSlugs),
                ].join(', ')}`,
            );
        }

        agents.forEach((agent) => {
            if (agent.contentType !== ContentAsCodeType.AI_AGENT) {
                throw new ParameterError(
                    `Invalid content type for AI agent '${agent.slug}'`,
                );
            }
            if (agent.version !== AGENT_AS_CODE_VERSION) {
                throw new ParameterError(
                    `Unsupported AI agent as-code version ${agent.version}`,
                );
            }
            if (!AGENT_SLUG_PATTERN.test(agent.slug)) {
                throw new ParameterError(
                    `Invalid AI agent slug '${agent.slug}'`,
                );
            }
            if (agent.enableContentTools && !agent.enableDataAccess) {
                throw new ParameterError(
                    `AI agent '${agent.slug}' must enable data access before enabling content tools`,
                );
            }
            const duplicateEvaluationTitles = (agent.evaluations ?? [])
                .map(({ title }) => title)
                .filter(
                    (title, index, titles) => titles.indexOf(title) !== index,
                );
            if (duplicateEvaluationTitles.length > 0) {
                throw new ParameterError(
                    `Duplicate evaluation titles for AI agent '${agent.slug}': ${[
                        ...new Set(duplicateEvaluationTitles),
                    ].join(', ')}`,
                );
            }
            agent.evaluations?.forEach((evaluation) => {
                if (evaluation.title.trim().length === 0) {
                    throw new ParameterError(
                        `AI agent '${agent.slug}' has an evaluation with an empty title`,
                    );
                }
                evaluation.prompts.forEach(({ prompt }) => {
                    if (prompt.trim().length === 0) {
                        throw new ParameterError(
                            `Evaluation '${evaluation.title}' for AI agent '${agent.slug}' has an empty prompt`,
                        );
                    }
                });
            });
        });

        const retentionEnabled =
            await this.aiOrganizationSettingsService.isThreadRetentionEnabled(
                user,
            );
        const retentionCeiling = retentionEnabled
            ? await this.aiOrganizationSettingsService.getThreadRetentionCeiling(
                  organizationUuid,
              )
            : null;
        const warnings: string[] = [];
        agents.forEach((agent) => {
            if (agent.threadRetentionHours === undefined) return;
            if (!retentionEnabled) {
                // A declared null is a no-op either way — only warn when a
                // real window is being dropped.
                if (agent.threadRetentionHours !== null) {
                    warnings.push(
                        `AI agent '${agent.slug}': threadRetentionHours was ignored — AI thread retention is not enabled for this organization`,
                    );
                }
                return;
            }
            if (!isValidRetentionWindowHours(agent.threadRetentionHours)) {
                throw new ParameterError(
                    `AI agent '${agent.slug}': ${RETENTION_WINDOW_HOURS_ERROR}`,
                );
            }
            if (
                exceedsRetentionCeiling(
                    agent.threadRetentionHours,
                    retentionCeiling,
                )
            ) {
                throw new ParameterError(
                    `AI agent '${agent.slug}': thread retention cannot exceed the organization limit of ${retentionCeiling} hours`,
                );
            }
        });

        const existingAgents = await this.aiAgentModel.findAgentsForCode({
            organizationUuid,
            projectUuid,
            slugs: agents.map(({ slug }) => slug),
        });
        const existingBySlug = new Map(
            existingAgents.map((agent) => [agent.slug, agent]),
        );
        const existingEvaluations =
            await this.aiAgentModel.findAgentEvalsForCode(
                existingAgents
                    .filter((existing) =>
                        agents.some(
                            (agent) =>
                                agent.slug === existing.slug &&
                                agent.evaluations !== undefined,
                        ),
                    )
                    .map(({ uuid }) => uuid),
            );
        const existingEvaluationsByAgentUuid =
            groupEvaluationsByAgentUuid(existingEvaluations);

        agents.forEach((agent) => {
            const existing = existingBySlug.get(agent.slug);
            if (!existing || agent.evaluations === undefined) return;

            const declaredTitles = new Set(
                agent.evaluations.map(({ title }) => title),
            );
            const ambiguousTitles = [
                ...(existingEvaluationsByAgentUuid.get(existing.uuid) ?? [])
                    .filter(({ title }) => declaredTitles.has(title))
                    .reduce<Map<string, number>>(
                        (counts, { title }) =>
                            counts.set(title, (counts.get(title) ?? 0) + 1),
                        new Map(),
                    ),
            ]
                .filter(([, count]) => count > 1)
                .map(([title]) => title);
            if (ambiguousTitles.length > 0) {
                throw new ParameterError(
                    `AI agent '${agent.slug}' has multiple existing evaluations titled: ${ambiguousTitles.join(', ')}`,
                );
            }
        });
        const changes: AgentAsCodeUpsertChanges = {
            created: [],
            updated: [],
            unchanged: [],
            deleted: [],
            ...(warnings.length > 0 ? { warnings } : {}),
        };

        for (const agent of agents) {
            const existing = existingBySlug.get(agent.slug);
            let agentUuid: string;
            let agentChanged = false;
            if (existing) {
                agentUuid = existing.uuid;
                const imageUrlChanged = existing.imageUrl !== agent.imageUrl;
                const retentionDeclared =
                    retentionEnabled &&
                    agent.threadRetentionHours !== undefined;
                const isUnchanged =
                    !force &&
                    isEqual(
                        getComparableAgent(
                            toAgentAsCode(existing, []),
                            retentionDeclared,
                        ),
                        getComparableAgent(agent, retentionDeclared),
                    );

                if (!isUnchanged) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.aiAgentModel.updateAgent({
                        agentUuid: existing.uuid,
                        organizationUuid,
                        projectUuid,
                        version: agent.agentVersion,
                        name: agent.name,
                        description: agent.description,
                        ...(imageUrlChanged
                            ? {
                                  imageUrl: agent.imageUrl,
                                  imageUrlSource: agent.imageUrl ? 'url' : null,
                              }
                            : {}),
                        instruction: agent.instruction,
                        tags: agent.tags,
                        enableDataAccess: agent.enableDataAccess,
                        enableSelfImprovement: agent.enableSelfImprovement,
                        enableContentTools: agent.enableContentTools,
                        enableUserContext: agent.enableUserContext,
                        enableSqlMode: agent.enableSqlMode ?? true,
                        ...(retentionEnabled &&
                        agent.threadRetentionHours !== undefined
                            ? {
                                  threadRetentionHours:
                                      agent.threadRetentionHours,
                              }
                            : {}),
                        modelConfig: agent.modelConfig,
                    });
                    agentChanged = true;
                }
            } else {
                // eslint-disable-next-line no-await-in-loop
                const createdAgent = await this.aiAgentModel.createAgent({
                    slug: agent.slug,
                    organizationUuid,
                    projectUuid,
                    name: agent.name,
                    description: agent.description,
                    imageUrl: agent.imageUrl,
                    instruction: agent.instruction,
                    tags: agent.tags,
                    enableDataAccess: agent.enableDataAccess,
                    enableSelfImprovement: agent.enableSelfImprovement,
                    enableContentTools: agent.enableContentTools,
                    enableUserContext: agent.enableUserContext,
                    enableSqlMode: agent.enableSqlMode ?? true,
                    threadRetentionHours:
                        retentionEnabled &&
                        agent.threadRetentionHours !== undefined
                            ? agent.threadRetentionHours
                            : null,
                    modelConfig: agent.modelConfig,
                    integrations: [],
                    groupAccess: [],
                    userAccess: [],
                    spaceAccess: [],
                    mcpServerUuids: [],
                    adminOnly: false,
                    version: agent.agentVersion,
                });
                agentUuid = createdAgent.uuid;
                agentChanged = true;
            }

            if (agent.evaluations !== undefined) {
                const evaluationsByTitle = new Map(
                    (existingEvaluationsByAgentUuid.get(agentUuid) ?? []).map(
                        (evaluation) => [evaluation.title, evaluation],
                    ),
                );

                for (const declaredEvaluation of agent.evaluations) {
                    const evaluation = normalizeEvaluation(declaredEvaluation);
                    const existingEvaluation = evaluationsByTitle.get(
                        evaluation.title,
                    );
                    if (!existingEvaluation) {
                        // eslint-disable-next-line no-await-in-loop
                        await this.aiAgentModel.createEval(
                            agentUuid,
                            evaluation,
                            user.userUuid,
                        );
                        agentChanged = true;
                    } else if (
                        force ||
                        !isEqual(
                            normalizeEvaluation(existingEvaluation),
                            evaluation,
                        )
                    ) {
                        // eslint-disable-next-line no-await-in-loop
                        await this.aiAgentModel.updateEval(
                            existingEvaluation.evalUuid,
                            evaluation,
                        );
                        agentChanged = true;
                    }
                }
            }

            if (!existing) {
                changes.created.push(agent.slug);
            } else if (agentChanged) {
                changes.updated.push(agent.slug);
            } else {
                changes.unchanged.push(agent.slug);
            }
        }

        return changes;
    }
}
