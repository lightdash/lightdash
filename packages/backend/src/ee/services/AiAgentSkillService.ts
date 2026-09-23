import { subject } from '@casl/ability';
import {
    AgentSkillsListing,
    AI_AGENT_SKILL_MAX_PER_AGENT,
    AI_AGENT_SKILLS_DISABLED_MESSAGE,
    AiAgentSkill,
    AiAgentSkillContent,
    AiAgentSkillFiles,
    AiAgentSkillSummary,
    AiAgentSkillValidationResult,
    AiAgentSkillVersion,
    AiAgentSkillVersionSource,
    AiAgentSkillVersionSummary,
    AlreadyExistsError,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    RegisteredAccount,
    SkillAsCode,
    SkillAsCodeUpsertChanges,
    validateAiAgentSkill,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { toSessionUser } from '../../auth/account';
import { isUniqueConstraintViolation } from '../../database/errors';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
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
    projectModel: ProjectModel;
    builtInSkills: BuiltInSkillsClient;
};

type AuthoringSource = Extract<AiAgentSkillVersionSource, 'ui' | 'as_code'>;

type SkillScope = { organizationUuid: string; projectUuid: string | null };

type SkillUpload = {
    account: RegisteredAccount;
    organizationUuid: string;
    reservedNames: string[];
};

const emptyChanges = (): SkillAsCodeUpsertChanges => ({
    created: [],
    updated: [],
    unchanged: [],
    deleted: [],
    failed: [],
    warnings: [],
});

const mergeChanges = (
    a: SkillAsCodeUpsertChanges,
    b: SkillAsCodeUpsertChanges,
): SkillAsCodeUpsertChanges => ({
    created: [...a.created, ...b.created],
    updated: [...a.updated, ...b.updated],
    unchanged: [...a.unchanged, ...b.unchanged],
    deleted: [...a.deleted, ...b.deleted],
    failed: [...a.failed, ...b.failed],
    warnings: [...a.warnings, ...b.warnings],
});

const sequentially = <T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> =>
    items.reduce<Promise<R[]>>(
        async (acc, item, index) => [...(await acc), await fn(item, index)],
        Promise.resolve([]),
    );

const organizationUuidOf = (account: RegisteredAccount): string => {
    const { organizationUuid } = account.organization;
    if (!organizationUuid) {
        throw new ForbiddenError('Organization not found');
    }
    return organizationUuid;
};

export class ValidationFailedError extends ParameterError {
    constructor(public readonly validation: AiAgentSkillValidationResult) {
        super('The skill is not valid', {
            errors: validation.errors,
            warnings: validation.warnings,
        });
    }
}

export class AiAgentSkillService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly aiAgentSkillModel: AiAgentSkillModel;

    private readonly aiAgentService: AiAgentService;

    private readonly featureFlagService: FeatureFlagService;

    private readonly projectModel: ProjectModel;

    private readonly builtInSkills: BuiltInSkillsClient;

    constructor(dependencies: AiAgentSkillServiceDependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.aiAgentSkillModel = dependencies.aiAgentSkillModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.featureFlagService = dependencies.featureFlagService;
        this.projectModel = dependencies.projectModel;
        this.builtInSkills = dependencies.builtInSkills;
    }

    async isEnabled(account: RegisteredAccount): Promise<boolean> {
        const [copilot, flag] = await Promise.all([
            this.aiAgentService.getIsCopilotEnabled({
                userUuid: account.user.userUuid,
                organizationUuid: account.organization.organizationUuid,
                organizationName: account.organization.name,
            }),
            this.featureFlagService.get({
                user: toSessionUser(account),
                featureFlagId: FeatureFlags.AiAgentCustomSkills,
            }),
        ]);
        return copilot && flag.enabled;
    }

    private async assertEnabled(account: RegisteredAccount): Promise<void> {
        if (!(await this.isEnabled(account))) {
            throw new ForbiddenError(AI_AGENT_SKILLS_DISABLED_MESSAGE);
        }
    }

    // An org-wide skill has no projectUuid, so only the organization-level rule can match it.
    private static skillSubject(scope: SkillScope) {
        return subject('AiAgentSkill', {
            organizationUuid: scope.organizationUuid,
            projectUuid: scope.projectUuid ?? undefined,
        });
    }

    private canView(account: RegisteredAccount, scope: SkillScope): boolean {
        return this.createAuditedAbility(account).can(
            'view',
            AiAgentSkillService.skillSubject(scope),
        );
    }

    private assertCanView(account: RegisteredAccount, scope: SkillScope) {
        if (!this.canView(account, scope)) {
            throw new ForbiddenError();
        }
    }

    private assertCanManage(account: RegisteredAccount, scope: SkillScope) {
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                AiAgentSkillService.skillSubject(scope),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    /** The target scope of a list or create: the project's organization when a project is given. */
    private async resolveScope(
        account: RegisteredAccount,
        projectUuid: string | null,
    ): Promise<SkillScope> {
        const organizationUuid = organizationUuidOf(account);
        if (projectUuid === null) {
            return { organizationUuid, projectUuid: null };
        }
        const project = await this.projectModel.getSummary(projectUuid);
        if (project.organizationUuid !== organizationUuid) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }
        return { organizationUuid, projectUuid };
    }

    private async getSkillInOrganization(
        account: RegisteredAccount,
        skillUuid: string,
        options: { includeDeleted: boolean },
    ): Promise<AiAgentSkill> {
        const skill = options.includeDeleted
            ? await this.aiAgentSkillModel.findIncludingDeleted(skillUuid)
            : await this.aiAgentSkillModel.find(skillUuid);
        if (!skill || skill.organizationUuid !== organizationUuidOf(account)) {
            throw new NotFoundError(`Skill ${skillUuid} not found`);
        }
        return skill;
    }

    private async validateFiles(
        files: AiAgentSkillFiles,
        options: { reserveBuiltInNames: boolean },
    ): Promise<AiAgentSkillValidationResult> {
        return validateAiAgentSkill({
            files,
            reservedNames: options.reserveBuiltInNames
                ? await this.builtInSkills.getAllNames()
                : [],
        });
    }

    private async validateOrThrow(
        files: AiAgentSkillFiles,
        options: { reserveBuiltInNames: boolean },
    ) {
        const result = await this.validateFiles(files, options);
        if (!result.valid) {
            throw new ValidationFailedError(result);
        }
        return result;
    }

    async validate(
        account: RegisteredAccount,
        files: AiAgentSkillFiles,
    ): Promise<AiAgentSkillValidationResult> {
        await this.assertEnabled(account);
        return this.validateFiles(files, { reserveBuiltInNames: true });
    }

    async listSkills(
        account: RegisteredAccount,
        args: { projectUuid: string | null; includeDeleted: boolean },
    ): Promise<AiAgentSkillSummary[]> {
        await this.assertEnabled(account);
        const scope = await this.resolveScope(account, args.projectUuid);
        this.assertCanView(account, scope);
        const skills = await this.aiAgentSkillModel.findAllForOrganization({
            organizationUuid: scope.organizationUuid,
            projectUuid: scope.projectUuid,
            includeDeleted: args.includeDeleted,
        });
        // A project filter still returns org-wide skills, which need org-level view.
        return skills.filter((skill) =>
            this.canView(account, {
                organizationUuid: skill.organizationUuid,
                projectUuid: skill.projectUuid,
            }),
        );
    }

    /** Deleted skills stay readable: version history and restore need them. */
    async getSkill(
        account: RegisteredAccount,
        skillUuid: string,
    ): Promise<AiAgentSkill> {
        await this.assertEnabled(account);
        const skill = await this.getSkillInOrganization(account, skillUuid, {
            includeDeleted: true,
        });
        this.assertCanView(account, skill);
        return skill;
    }

    private async assertAgentsUsable(
        account: RegisteredAccount,
        agentUuids: string[],
        projectUuid: string | null,
    ): Promise<void> {
        const user = toSessionUser(account);
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
                const bound =
                    await this.aiAgentSkillModel.countBoundToAgent(agentUuid);
                if (bound + 1 > AI_AGENT_SKILL_MAX_PER_AGENT) {
                    throw new ParameterError(
                        `Agent ${agentUuid} already has ${AI_AGENT_SKILL_MAX_PER_AGENT} skills.`,
                    );
                }
            }),
        );
    }

    async createSkill(
        account: RegisteredAccount,
        args: {
            files: AiAgentSkillFiles;
            projectUuid: string | null;
            agentUuids: string[];
            source: AuthoringSource;
        },
    ): Promise<AiAgentSkill> {
        await this.assertEnabled(account);
        const scope = await this.resolveScope(account, args.projectUuid);
        this.assertCanManage(account, scope);
        const validation = await this.validateOrThrow(args.files, {
            reserveBuiltInNames: true,
        });
        const { name } = validation.parsed.frontmatter;
        const existing = await this.aiAgentSkillModel.findByName({
            organizationUuid: scope.organizationUuid,
            name,
        });
        if (existing) {
            throw AiAgentSkillService.nameTakenError(existing);
        }
        const agentUuids = [...new Set(args.agentUuids)];
        await this.assertAgentsUsable(account, agentUuids, scope.projectUuid);
        const content: AiAgentSkillContent = {
            schemaVersion: 1,
            files: args.files,
        };
        const skill = await this.aiAgentSkillModel
            .create({
                organizationUuid: scope.organizationUuid,
                projectUuid: scope.projectUuid,
                content,
                parsed: validation.parsed,
                source: args.source,
                userUuid: account.user.userUuid,
                agentUuids,
            })
            .catch(async (error: unknown) => {
                if (!isUniqueConstraintViolation(error)) throw error;
                const winner = await this.aiAgentSkillModel.findByName({
                    organizationUuid: scope.organizationUuid,
                    name,
                });
                throw winner
                    ? AiAgentSkillService.nameTakenError(winner)
                    : error;
            });
        this.analytics.track({
            event: 'ai_agent_skill.created',
            userId: account.user.userUuid,
            properties: {
                organizationId: scope.organizationUuid,
                projectId: scope.projectUuid,
                skillId: skill.uuid,
                source: args.source,
                resourceCount: validation.parsed.resources.length,
                agentCount: agentUuids.length,
            },
        });
        return skill;
    }

    private static nameTakenError(existing: AiAgentSkill): AlreadyExistsError {
        return new AlreadyExistsError(
            existing.deletedAt
                ? `A deleted skill named "${existing.name}" (${existing.uuid}) still reserves that name. Restore one of its versions or pick another name.`
                : `A skill named "${existing.name}" already exists.`,
        );
    }

    async updateSkill(
        account: RegisteredAccount,
        skillUuid: string,
        args: { files: AiAgentSkillFiles; source: AuthoringSource },
    ): Promise<{ skill: AiAgentSkill; created: boolean }> {
        await this.assertEnabled(account);
        const existing = await this.getSkillInOrganization(account, skillUuid, {
            includeDeleted: false,
        });
        this.assertCanManage(account, existing);
        const validation = await this.validateOrThrow(args.files, {
            reserveBuiltInNames: true,
        });
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
            revive: false,
            userUuid: account.user.userUuid,
        });
        this.analytics.track({
            event: 'ai_agent_skill.updated',
            userId: account.user.userUuid,
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
        account: RegisteredAccount,
        skillUuid: string,
    ): Promise<AiAgentSkillVersionSummary[]> {
        await this.getSkill(account, skillUuid);
        return this.aiAgentSkillModel.listVersions(skillUuid);
    }

    async getVersion(
        account: RegisteredAccount,
        skillUuid: string,
        versionNumber: number,
    ): Promise<AiAgentSkillVersion> {
        await this.getSkill(account, skillUuid);
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
        account: RegisteredAccount,
        skillUuid: string,
        versionNumber: number,
    ): Promise<AiAgentSkill> {
        await this.assertEnabled(account);
        const existing = await this.getSkillInOrganization(account, skillUuid, {
            includeDeleted: true,
        });
        this.assertCanManage(account, existing);
        const version = await this.aiAgentSkillModel.findVersion({
            skillUuid,
            versionNumber,
        });
        if (!version) {
            throw new NotFoundError(
                `Version ${versionNumber} of skill ${skillUuid} not found`,
            );
        }
        // The row already owns its name, so a built-in shipped later cannot block the restore.
        const validation = await this.validateOrThrow(version.content.files, {
            reserveBuiltInNames: false,
        });
        const revived = existing.deletedAt !== null;
        const result = await this.aiAgentSkillModel.publishVersion({
            skillUuid,
            content: version.content,
            parsed: validation.parsed,
            source: 'restore',
            restoredFromVersion: versionNumber,
            revive: revived,
            userUuid: account.user.userUuid,
        });
        this.analytics.track({
            event: 'ai_agent_skill.restored',
            userId: account.user.userUuid,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: existing.projectUuid,
                skillId: skillUuid,
                restoredFromVersion: versionNumber,
                versionNumber: result.skill.currentVersion.versionNumber,
                contentChanged:
                    version.contentHash !== existing.currentVersion.contentHash,
                revived,
            },
        });
        return result.skill;
    }

    /** Soft-deletes and unbinds everywhere; returns the agents that lost the skill. */
    async deleteSkill(
        account: RegisteredAccount,
        skillUuid: string,
    ): Promise<string[]> {
        await this.assertEnabled(account);
        const existing = await this.getSkillInOrganization(account, skillUuid, {
            includeDeleted: true,
        });
        this.assertCanManage(account, existing);
        if (existing.deletedAt) {
            return [];
        }
        const unbound = await this.aiAgentSkillModel.softDelete({
            skillUuid,
            userUuid: account.user.userUuid,
        });
        this.analytics.track({
            event: 'ai_agent_skill.deleted',
            userId: account.user.userUuid,
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
        account: RegisteredAccount,
        args: { projectUuid: string; agentUuid: string },
    ): Promise<AgentSkillsListing> {
        await this.aiAgentService.getAgent(
            toSessionUser(account),
            args.agentUuid,
            args.projectUuid,
        );
        const enabled = await this.isEnabled(account);
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

    /**
     * What an MCP caller may read. With an agent selected, that agent's bound
     * skills for anyone who can use it; otherwise the organization catalogue,
     * empty when the caller lacks the view scope. Never throws: skills are
     * optional context for MCP, not a gate on the connection.
     */
    async listMcpSkills(
        account: RegisteredAccount,
        args: { agentUuid: string | null },
    ): Promise<AiAgentSkill[]> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid || !(await this.isEnabled(account))) return [];
        const skills = await (async () => {
            if (args.agentUuid) {
                await this.aiAgentService.getAgent(
                    toSessionUser(account),
                    args.agentUuid,
                );
                return this.aiAgentSkillModel.findBoundToAgent(args.agentUuid);
            }
            if (
                !this.canView(account, { organizationUuid, projectUuid: null })
            ) {
                return [];
            }
            const summaries =
                await this.aiAgentSkillModel.findAllForOrganization({
                    organizationUuid,
                    projectUuid: null,
                    includeDeleted: false,
                });
            const loaded = await Promise.all(
                summaries.map((summary) =>
                    this.aiAgentSkillModel.find(summary.uuid),
                ),
            );
            return loaded.filter(
                (skill): skill is AiAgentSkill => skill !== undefined,
            );
        })();
        return skills.filter((skill) =>
            skill.parsed.frontmatter.availability.includes('mcp'),
        );
    }

    /** Every skill the caller may view, as folders, for as-code download. */
    async downloadSkills(
        account: RegisteredAccount,
        args: { names: string[] },
    ): Promise<{ skills: SkillAsCode[]; missingNames: string[] }> {
        const summaries = await this.listSkills(account, {
            projectUuid: null,
            includeDeleted: false,
        });
        const wanted = args.names.length > 0 ? new Set(args.names) : null;
        const selected = summaries.filter(
            (summary) => wanted === null || wanted.has(summary.name),
        );
        const skills = await Promise.all(
            selected.map(async (summary) => {
                const skill = await this.aiAgentSkillModel.find(summary.uuid);
                return skill
                    ? [{ name: skill.name, files: skill.content.files }]
                    : [];
            }),
        ).then((folders) => folders.flat());
        const found = new Set(skills.map((skill) => skill.name));
        return {
            skills,
            missingNames: args.names.filter((name) => !found.has(name)),
        };
    }

    private async upsertSkillFolder(
        upload: SkillUpload,
        skill: SkillAsCode,
    ): Promise<SkillAsCodeUpsertChanges> {
        const { account, organizationUuid } = upload;
        const validation = validateAiAgentSkill({
            files: skill.files,
            reservedNames: upload.reservedNames,
            folderName: skill.name,
        });
        const warnings = validation.warnings.map(
            (warning) => `${skill.name}/${warning.path}: ${warning.message}`,
        );
        if (!validation.valid) {
            return {
                ...emptyChanges(),
                warnings,
                failed: [
                    {
                        name: skill.name,
                        message: validation.errors
                            .map((issue) => `${issue.path}: ${issue.message}`)
                            .join(' '),
                    },
                ],
            };
        }
        const existing = await this.aiAgentSkillModel.findByName({
            organizationUuid,
            name: skill.name,
        });
        if (existing?.deletedAt) {
            // Like charts as code, an upload revives a deleted name in place.
            this.assertCanManage(account, existing);
            await this.aiAgentSkillModel.publishVersion({
                skillUuid: existing.uuid,
                content: { schemaVersion: 1, files: skill.files },
                parsed: validation.parsed,
                source: 'as_code',
                restoredFromVersion: null,
                revive: true,
                userUuid: account.user.userUuid,
            });
            return {
                ...emptyChanges(),
                warnings: [
                    ...warnings,
                    `Skill "${skill.name}" had been deleted and was restored by this upload.`,
                ],
                updated: [skill.name],
            };
        }
        if (existing) {
            const result = await this.updateSkill(account, existing.uuid, {
                files: skill.files,
                source: 'as_code',
            });
            return result.created
                ? { ...emptyChanges(), warnings, updated: [skill.name] }
                : { ...emptyChanges(), warnings, unchanged: [skill.name] };
        }
        await this.createSkill(account, {
            files: skill.files,
            projectUuid: null,
            agentUuids: [],
            source: 'as_code',
        });
        return { ...emptyChanges(), warnings, created: [skill.name] };
    }

    private async deleteSkillByName(
        account: RegisteredAccount,
        organizationUuid: string,
        name: string,
    ): Promise<SkillAsCodeUpsertChanges> {
        const existing = await this.aiAgentSkillModel.findByName({
            organizationUuid,
            name,
        });
        if (!existing || existing.deletedAt) {
            return {
                ...emptyChanges(),
                warnings: [
                    `Skill "${name}" was not deleted because it does not exist.`,
                ],
            };
        }
        await this.deleteSkill(account, existing.uuid);
        return { ...emptyChanges(), deleted: [name] };
    }

    /** As-code upload: create, republish on hash change or report unchanged, one folder at a time. Absence never deletes. */
    async upsertSkills(
        account: RegisteredAccount,
        args: { skills: SkillAsCode[]; deleteNames: string[] },
    ): Promise<SkillAsCodeUpsertChanges> {
        const organizationUuid = organizationUuidOf(account);
        await this.assertEnabled(account);
        this.assertCanManage(account, { organizationUuid, projectUuid: null });
        const upload: SkillUpload = {
            account,
            organizationUuid,
            reservedNames: await this.builtInSkills.getAllNames(),
        };
        const firstIndexByName = new Map(
            args.skills.map((skill, index) => [skill.name, index] as const),
        );
        const upserts = await sequentially(args.skills, (skill, index) =>
            firstIndexByName.get(skill.name) === index
                ? this.upsertSkillFolder(upload, skill)
                : Promise.resolve({
                      ...emptyChanges(),
                      failed: [
                          {
                              name: skill.name,
                              message: `Duplicate skill folder "${skill.name}" in upload.`,
                          },
                      ],
                  }),
        );
        const deletes = await sequentially(args.deleteNames, (name) =>
            this.deleteSkillByName(account, organizationUuid, name),
        );
        return [...upserts, ...deletes].reduce(mergeChanges, emptyChanges());
    }

    /** Authoritative: binds the listed skills and unbinds the rest. */
    async setAgentSkills(
        account: RegisteredAccount,
        args: { projectUuid: string; agentUuid: string; skillUuids: string[] },
    ): Promise<AgentSkillsListing> {
        await this.assertEnabled(account);
        const agent = await this.aiAgentService.getAgent(
            toSessionUser(account),
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
            uniqueUuids.map((skillUuid) =>
                this.getSkillInOrganization(account, skillUuid, {
                    includeDeleted: false,
                }),
            ),
        );
        skills.forEach((skill) => {
            this.assertCanManage(account, skill);
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
        const removed = currentlyBound.filter(
            (skill) => !uniqueUuids.includes(skill.uuid),
        );
        removed.forEach((skill) => this.assertCanManage(account, skill));
        await this.aiAgentSkillModel.setAgentSkills({
            agentUuid: args.agentUuid,
            skillUuids: uniqueUuids,
        });
        const boundBefore = new Set(currentlyBound.map((skill) => skill.uuid));
        this.analytics.track({
            event: 'ai_agent_skill.bindings_updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuidOf(account),
                projectId: args.projectUuid,
                agentId: args.agentUuid,
                boundCount: uniqueUuids.length,
                addedCount: uniqueUuids.filter((uuid) => !boundBefore.has(uuid))
                    .length,
                removedCount: removed.length,
            },
        });
        return this.listAgentSkills(account, args);
    }
}
