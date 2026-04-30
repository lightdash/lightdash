import { subject } from '@casl/ability';
import {
    AgentAsCode,
    AgentAsCodeUpsertChanges,
    ContentAsCodeType,
    ForbiddenError,
    ParameterError,
    SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { LightdashConfig } from '../../../config/parseConfig';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import { paginateAsCode } from '../../../services/CoderService/pagination';
import { AiAgentModel } from '../../models/AiAgentModel';

const AGENT_AS_CODE_VERSION = 1;

type AgentForCodeRow = Awaited<
    ReturnType<AiAgentModel['findAgentsForCode']>
>[number];

const toAgentAsCode = (agent: AgentForCodeRow): AgentAsCode => ({
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    imageUrl: agent.imageUrl,
    instruction: agent.instruction,
    tags: agent.tags,
    enableDataAccess: agent.enableDataAccess,
    enableSelfImprovement: agent.enableSelfImprovement,
    version: AGENT_AS_CODE_VERSION,
    contentType: ContentAsCodeType.AI_AGENT,
    updatedAt: agent.updatedAt,
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

    constructor(deps: Dependencies) {
        super({ serviceName: 'AiAgentCoderService' });
        this.aiAgentModel = deps.aiAgentModel;
        this.projectModel = deps.projectModel;
        this.lightdashConfig = deps.lightdashConfig;
    }

    private async assertCanManageAgents(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ organizationUuid: string }> {
        const project = await this.projectModel.get(projectUuid);
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { organizationUuid: project.organizationUuid };
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
        const { organizationUuid } = await this.assertCanManageAgents(
            user,
            projectUuid,
        );

        const agentUuids = ids?.filter(isValidUuid) ?? [];
        const slugs = ids?.filter((id) => !isValidUuid(id)) ?? [];

        const agents = await this.aiAgentModel.findAgentsForCode({
            organizationUuid,
            projectUuid,
            slugs: slugs.length > 0 ? slugs : undefined,
            agentUuids: agentUuids.length > 0 ? agentUuids : undefined,
        });

        const missingIds =
            ids && ids.length > 0
                ? ids.filter(
                      (id) =>
                          !agents.some((a) => a.slug === id || a.uuid === id),
                  )
                : [];

        const {
            page,
            total,
            offset: nextOffset,
        } = paginateAsCode({
            items: agents,
            offset,
            pageSize: this.lightdashConfig.contentAsCode.maxDownloads,
        });

        return {
            agents: page.map(toAgentAsCode),
            missingIds,
            total,
            offset: nextOffset,
        };
    }

    async upsertAgents(
        user: SessionUser,
        projectUuid: string,
        agents: AgentAsCode[],
    ): Promise<AgentAsCodeUpsertChanges> {
        const { organizationUuid } = await this.assertCanManageAgents(
            user,
            projectUuid,
        );

        const slugs = agents.map((a) => a.slug);
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const slug of slugs) {
            if (seen.has(slug)) {
                duplicates.add(slug);
            } else {
                seen.add(slug);
            }
        }
        if (duplicates.size > 0) {
            throw new ParameterError(
                `Duplicate slugs in upload batch: ${Array.from(duplicates).join(', ')}`,
            );
        }

        const changes: AgentAsCodeUpsertChanges = {
            created: [],
            updated: [],
            deleted: [],
        };

        const existingRows = await this.aiAgentModel.findAgentsBySlugs({
            projectUuid,
            slugs,
        });
        const existingBySlug = new Map(
            existingRows.map((row) => [row.slug, row]),
        );

        for (const agent of agents) {
            const existing = existingBySlug.get(agent.slug);
            if (existing) {
                // eslint-disable-next-line no-await-in-loop
                await this.aiAgentModel.updateAgent({
                    agentUuid: existing.ai_agent_uuid,
                    organizationUuid,
                    projectUuid,
                    name: agent.name,
                    description: agent.description,
                    imageUrl: agent.imageUrl,
                    tags: agent.tags ?? null,
                    instruction: agent.instruction,
                    enableDataAccess: agent.enableDataAccess,
                    enableSelfImprovement: agent.enableSelfImprovement,
                    // integrations / *Access intentionally omitted: as-code v1
                    // does not manage these fields, so undefined preserves
                    // whatever was set via the UI.
                });
                changes.updated.push(agent.slug);
            } else {
                // eslint-disable-next-line no-await-in-loop
                await this.aiAgentModel.createAgent({
                    slug: agent.slug,
                    projectUuid,
                    organizationUuid,
                    name: agent.name,
                    description: agent.description,
                    tags: agent.tags ?? null,
                    instruction: agent.instruction,
                    enableDataAccess: agent.enableDataAccess,
                    enableSelfImprovement: agent.enableSelfImprovement,
                    integrations: [],
                    groupAccess: [],
                    userAccess: [],
                    spaceAccess: [],
                    imageUrl: agent.imageUrl,
                    version: 1,
                });
                changes.created.push(agent.slug);
            }
        }

        return changes;
    }
}
