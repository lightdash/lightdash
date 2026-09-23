import { subject } from '@casl/ability';
import {
    AgentSkillsListing,
    AI_AGENT_SKILL_MAX_PER_AGENT,
    AiAgentSkill,
    AiAgentSkillContent,
    AiAgentSkillFiles,
    AiAgentSkillSummary,
    AiAgentSkillValidationResult,
    AiAgentSkillVersion,
    AiAgentSkillVersionSummary,
    AlreadyExistsError,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    SessionUser,
    validateAiAgentSkill,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { BaseService } from '../../services/BaseService';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { AiAgentSkillModel } from '../models/AiAgentSkillModel';
import type { BuiltInSkills } from './ai/skills/builtInSkills';
import type { AiAgentService } from './AiAgentService/AiAgentService';

type BuiltInSkillsClient = Pick<
    typeof BuiltInSkills,
    'getAllNames' | 'getAiAgentSkills'
>;

type AiAgentSkillServiceDependencies = {
    analytics: LightdashAnalytics;
    aiAgentSkillModel: AiAgentSkillModel;
    aiAgentService: AiAgentService;
    featureFlagService: FeatureFlagService;
    builtInSkills: BuiltInSkillsClient;
};

export class ValidationFailedError extends ParameterError {
    constructor(public readonly validation: AiAgentSkillValidationResult) {
        super('The skill is not valid', {
            errors: validation.errors,
            warnings: validation.warnings,
        });
    }
}

const assertOrganizationUuid = (user: SessionUser): string => {
    if (!user.organizationUuid) {
        throw new ForbiddenError('Organization not found');
    }
    return user.organizationUuid;
};

export class AiAgentSkillService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly aiAgentSkillModel: AiAgentSkillModel;

    private readonly aiAgentService: AiAgentService;

    private readonly featureFlagService: FeatureFlagService;

    private readonly builtInSkills: BuiltInSkillsClient;

    constructor(dependencies: AiAgentSkillServiceDependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.aiAgentSkillModel = dependencies.aiAgentSkillModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.featureFlagService = dependencies.featureFlagService;
        this.builtInSkills = dependencies.builtInSkills;
    }

    async isEnabled(user: SessionUser): Promise<boolean> {
        const [copilot, flag] = await Promise.all([
            this.aiAgentService.getIsCopilotEnabled(user),
            this.featureFlagService.get({
                user,
                featureFlagId: FeatureFlags.AiAgentCustomSkills,
            }),
        ]);
        return copilot && flag.enabled;
    }

    private async assertEnabled(user: SessionUser): Promise<void> {
        if (!(await this.isEnabled(user))) {
            throw new ForbiddenError('Custom agent skills are not enabled');
        }
    }

    private assertCanView(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string | null,
    ): void {
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'view',
                subject('AiAgentSkill', {
                    organizationUuid,
                    projectUuid: projectUuid ?? undefined,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    /**
     * A skill with no project is org-wide: the project-level rule cannot match
     * a subject without a projectUuid, so managing it needs org-level permission.
     */
    private assertCanManage(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string | null,
    ): void {
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'manage',
                subject('AiAgentSkill', {
                    organizationUuid,
                    projectUuid: projectUuid ?? undefined,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async getOwnedSkill(
        user: SessionUser,
        skillUuid: string,
    ): Promise<AiAgentSkill> {
        const organizationUuid = assertOrganizationUuid(user);
        const skill = await this.aiAgentSkillModel.find(skillUuid);
        if (!skill || skill.organizationUuid !== organizationUuid) {
            throw new NotFoundError(`Skill ${skillUuid} not found`);
        }
        return skill;
    }

    private async validateOrThrow(files: AiAgentSkillFiles) {
        const result = validateAiAgentSkill({
            files,
            reservedNames: await this.builtInSkills.getAllNames(),
        });
        if (!result.valid) {
            throw new ValidationFailedError(result);
        }
        return result;
    }

    async validate(
        user: SessionUser,
        files: AiAgentSkillFiles,
    ): Promise<AiAgentSkillValidationResult> {
        await this.assertEnabled(user);
        return validateAiAgentSkill({
            files,
            reservedNames: await this.builtInSkills.getAllNames(),
        });
    }

    async listSkills(
        user: SessionUser,
        args: { projectUuid?: string | null },
    ): Promise<AiAgentSkillSummary[]> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertEnabled(user);
        this.assertCanView(user, organizationUuid, args.projectUuid ?? null);
        return this.aiAgentSkillModel.findAllForOrganization({
            organizationUuid,
            projectUuid: args.projectUuid ?? null,
        });
    }

    async getSkill(
        user: SessionUser,
        skillUuid: string,
    ): Promise<AiAgentSkill> {
        await this.assertEnabled(user);
        const skill = await this.getOwnedSkill(user, skillUuid);
        this.assertCanView(user, skill.organizationUuid, skill.projectUuid);
        return skill;
    }

    private async resolveAgents(
        user: SessionUser,
        agentUuids: string[],
        projectUuid: string | null,
    ): Promise<void> {
        await Promise.all(
            agentUuids.map(async (agentUuid) => {
                const agent = await this.aiAgentService.getAgent(
                    user,
                    agentUuid,
                );
                if (projectUuid && agent.projectUuid !== projectUuid) {
                    throw new ParameterError(
                        `Agent ${agentUuid} does not belong to project ${projectUuid}.`,
                    );
                }
            }),
        );
    }

    async createSkill(
        user: SessionUser,
        args: {
            files: AiAgentSkillFiles;
            projectUuid: string | null;
            agentUuids: string[];
            source: 'ui' | 'as_code';
        },
    ): Promise<AiAgentSkill> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertEnabled(user);
        this.assertCanManage(user, organizationUuid, args.projectUuid);
        const validation = await this.validateOrThrow(args.files);
        const { name } = validation.parsed.frontmatter;

        const existing = await this.aiAgentSkillModel.findByName({
            organizationUuid,
            name,
        });
        if (existing) {
            throw new AlreadyExistsError(
                existing.deletedAt
                    ? `A deleted skill named "${name}" still reserves that name. Restore it from the skills library or pick another name.`
                    : `A skill named "${name}" already exists.`,
            );
        }
        await this.resolveAgents(user, args.agentUuids, args.projectUuid);
        const content: AiAgentSkillContent = {
            schemaVersion: 1,
            files: args.files,
        };
        const skill = await this.aiAgentSkillModel.create({
            organizationUuid,
            projectUuid: args.projectUuid,
            content,
            parsed: validation.parsed,
            source: args.source,
            userUuid: user.userUuid,
            agentUuids: args.agentUuids,
        });
        this.analytics.track({
            event: 'ai_agent_skill.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: args.projectUuid,
                skillId: skill.uuid,
                source: args.source,
                resourceCount: validation.parsed.resources.length,
                agentCount: args.agentUuids.length,
            },
        });
        return skill;
    }

    async updateSkill(
        user: SessionUser,
        skillUuid: string,
        args: { files: AiAgentSkillFiles; source: 'ui' | 'as_code' },
    ): Promise<{ skill: AiAgentSkill; created: boolean }> {
        await this.assertEnabled(user);
        const existing = await this.getOwnedSkill(user, skillUuid);
        this.assertCanManage(
            user,
            existing.organizationUuid,
            existing.projectUuid,
        );
        if (existing.deletedAt) {
            throw new NotFoundError(`Skill ${skillUuid} has been deleted`);
        }
        const validation = await this.validateOrThrow(args.files);
        if (validation.parsed.frontmatter.name !== existing.name) {
            throw new ParameterError(
                `The skill name cannot change: "${existing.name}" is its identity. Change the title instead, or create a new skill.`,
            );
        }
        const result = await this.aiAgentSkillModel.publishVersion({
            skillUuid,
            content: { schemaVersion: 1, files: args.files },
            parsed: validation.parsed,
            source: args.source,
            restoredFromVersion: null,
            userUuid: user.userUuid,
        });
        this.analytics.track({
            event: 'ai_agent_skill.updated',
            userId: user.userUuid,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: existing.projectUuid,
                skillId: skillUuid,
                source: args.source,
                versionNumber: result.skill.currentVersion.versionNumber,
                contentChanged: result.created,
            },
        });
        return result;
    }

    async listVersions(
        user: SessionUser,
        skillUuid: string,
    ): Promise<AiAgentSkillVersionSummary[]> {
        await this.getSkill(user, skillUuid);
        return this.aiAgentSkillModel.listVersions(skillUuid);
    }

    async getVersion(
        user: SessionUser,
        skillUuid: string,
        versionNumber: number,
    ): Promise<AiAgentSkillVersion> {
        await this.getSkill(user, skillUuid);
        const version = await this.aiAgentSkillModel.findVersion({
            skillUuid,
            versionNumber,
        });
        if (!version) {
            throw new NotFoundError(
                `Version ${versionNumber} of skill ${skillUuid} not found`,
            );
        }
        return version;
    }

    async restoreVersion(
        user: SessionUser,
        skillUuid: string,
        versionNumber: number,
    ): Promise<AiAgentSkill> {
        await this.assertEnabled(user);
        const existing = await this.getOwnedSkill(user, skillUuid);
        this.assertCanManage(
            user,
            existing.organizationUuid,
            existing.projectUuid,
        );
        const version = await this.aiAgentSkillModel.findVersion({
            skillUuid,
            versionNumber,
        });
        if (!version) {
            throw new NotFoundError(
                `Version ${versionNumber} of skill ${skillUuid} not found`,
            );
        }
        const validation = await this.validateOrThrow(version.content.files);
        const result = await this.aiAgentSkillModel.publishVersion({
            skillUuid,
            content: version.content,
            parsed: validation.parsed,
            source: 'restore',
            restoredFromVersion: versionNumber,
            userUuid: user.userUuid,
        });
        if (existing.deletedAt) {
            await this.aiAgentSkillModel.restoreDeleted({
                skillUuid,
                userUuid: user.userUuid,
            });
        }
        this.analytics.track({
            event: 'ai_agent_skill.updated',
            userId: user.userUuid,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: existing.projectUuid,
                skillId: skillUuid,
                source: 'restore',
                versionNumber: result.skill.currentVersion.versionNumber,
                contentChanged: result.created,
            },
        });
        return this.aiAgentSkillModel.get(skillUuid);
    }

    /** Soft-deletes and unbinds everywhere; returns the agents that lost the skill. */
    async deleteSkill(user: SessionUser, skillUuid: string): Promise<string[]> {
        await this.assertEnabled(user);
        const existing = await this.getOwnedSkill(user, skillUuid);
        this.assertCanManage(
            user,
            existing.organizationUuid,
            existing.projectUuid,
        );
        if (existing.deletedAt) {
            return [];
        }
        const unbound = await this.aiAgentSkillModel.softDelete({
            skillUuid,
            userUuid: user.userUuid,
        });
        this.analytics.track({
            event: 'ai_agent_skill.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: existing.projectUuid,
                skillId: skillUuid,
                unboundAgentCount: unbound.length,
            },
        });
        return unbound;
    }

    /** What an agent's users see: bound custom skills plus the built-ins, no skill scope needed. */
    async listAgentSkills(
        user: SessionUser,
        args: { projectUuid: string; agentUuid: string },
    ): Promise<AgentSkillsListing> {
        await this.aiAgentService.getAgent(
            user,
            args.agentUuid,
            args.projectUuid,
        );
        const enabled = await this.isEnabled(user);
        const [skills, builtIns] = await Promise.all([
            enabled
                ? this.aiAgentSkillModel.findBoundToAgent(args.agentUuid)
                : Promise.resolve([]),
            this.builtInSkills.getAiAgentSkills(),
        ]);
        return {
            skills: skills.map(({ content, parsed, ...summary }) => summary),
            builtInSkills: builtIns.map((skill) => ({
                name: skill.name,
                description: skill.description,
            })),
        };
    }

    /** Authoritative: binds the listed skills and unbinds the rest. */
    async setAgentSkills(
        user: SessionUser,
        args: { projectUuid: string; agentUuid: string; skillUuids: string[] },
    ): Promise<AgentSkillsListing> {
        await this.assertEnabled(user);
        const agent = await this.aiAgentService.getAgent(
            user,
            args.agentUuid,
            args.projectUuid,
        );
        const uniqueUuids = [...new Set(args.skillUuids)];
        if (uniqueUuids.length > AI_AGENT_SKILL_MAX_PER_AGENT) {
            throw new ParameterError(
                `An agent can have at most ${AI_AGENT_SKILL_MAX_PER_AGENT} skills.`,
            );
        }
        const skills = await Promise.all(
            uniqueUuids.map((skillUuid) => this.getOwnedSkill(user, skillUuid)),
        );
        skills.forEach((skill) => {
            this.assertCanManage(
                user,
                skill.organizationUuid,
                skill.projectUuid,
            );
            if (skill.deletedAt) {
                throw new ParameterError(
                    `Skill "${skill.name}" has been deleted and cannot be bound.`,
                );
            }
            if (skill.projectUuid && skill.projectUuid !== agent.projectUuid) {
                throw new ParameterError(
                    `Skill "${skill.name}" belongs to another project.`,
                );
            }
        });
        // Unbinding skills the caller cannot manage would let an agent-only role edit them.
        const currentlyBound = await this.aiAgentSkillModel.findBoundToAgent(
            args.agentUuid,
        );
        currentlyBound
            .filter((skill) => !uniqueUuids.includes(skill.uuid))
            .forEach((skill) =>
                this.assertCanManage(
                    user,
                    skill.organizationUuid,
                    skill.projectUuid,
                ),
            );
        await this.aiAgentSkillModel.setAgentSkills({
            agentUuid: args.agentUuid,
            skillUuids: uniqueUuids,
        });
        return this.listAgentSkills(user, args);
    }
}
