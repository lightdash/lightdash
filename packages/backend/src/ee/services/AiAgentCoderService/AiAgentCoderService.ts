import { subject } from '@casl/ability';
import {
    ContentAsCodeType,
    ForbiddenError,
    ParameterError,
    type AgentAsCode,
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

const AGENT_AS_CODE_VERSION = 1;
const AGENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type AgentForCode = Awaited<
    ReturnType<AiAgentModel['findAgentsForCode']>
>[number];

const toAgentAsCode = (agent: AgentForCode): AgentAsCode => ({
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
    modelConfig: agent.modelConfig,
    updatedAt: agent.updatedAt,
});

const getComparableAgent = (agent: AgentAsCode) => ({
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
    modelConfig: agent.modelConfig,
});

type Dependencies = {
    aiAgentModel: AiAgentModel;
    projectModel: ProjectModel;
    lightdashConfig: LightdashConfig;
};

export class AiAgentCoderService extends BaseService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly projectModel: ProjectModel;

    private readonly lightdashConfig: LightdashConfig;

    constructor({ aiAgentModel, projectModel, lightdashConfig }: Dependencies) {
        super({ serviceName: 'AiAgentCoderService' });
        this.aiAgentModel = aiAgentModel;
        this.projectModel = projectModel;
        this.lightdashConfig = lightdashConfig;
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

        return {
            agents: page.page.map(toAgentAsCode),
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
        });

        const existingAgents = await this.aiAgentModel.findAgentsForCode({
            organizationUuid,
            projectUuid,
            slugs: agents.map(({ slug }) => slug),
        });
        const existingBySlug = new Map(
            existingAgents.map((agent) => [agent.slug, agent]),
        );
        const changes: AgentAsCodeUpsertChanges = {
            created: [],
            updated: [],
            unchanged: [],
            deleted: [],
        };

        for (const agent of agents) {
            const existing = existingBySlug.get(agent.slug);
            if (existing) {
                const imageUrlChanged = existing.imageUrl !== agent.imageUrl;
                const isUnchanged =
                    !force &&
                    isEqual(
                        getComparableAgent(toAgentAsCode(existing)),
                        getComparableAgent(agent),
                    );

                if (isUnchanged) {
                    changes.unchanged.push(agent.slug);
                } else {
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
                        modelConfig: agent.modelConfig,
                    });
                    changes.updated.push(agent.slug);
                }
            } else {
                // eslint-disable-next-line no-await-in-loop
                await this.aiAgentModel.createAgent({
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
                    modelConfig: agent.modelConfig,
                    integrations: [],
                    groupAccess: [],
                    userAccess: [],
                    spaceAccess: [],
                    mcpServerUuids: [],
                    adminOnly: false,
                    version: agent.agentVersion,
                });
                changes.created.push(agent.slug);
            }
        }

        return changes;
    }
}
