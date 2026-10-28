import { subject } from '@casl/ability';
import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES,
    CONTENT_AS_CODE_VERSIONS,
    ContentAsCodeType,
    exceedsRetentionCeiling,
    ForbiddenError,
    getAiAgentDocumentFileExtension,
    getErrorMessage,
    isValidRetentionWindowHours,
    normalizeAiAgentDocumentName,
    ParameterError,
    RETENTION_WINDOW_HOURS_ERROR,
    type AgentAsCode,
    type AgentAsCodeEvaluation,
    type AgentAsCodeKnowledgeDocument,
    type AgentAsCodeUpsertChanges,
    type SessionUser,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { validate as isValidUuid } from 'uuid';
import { fromSession } from '../../../auth/account';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type ContentAsCodeProjectSettingsModel } from '../../../models/ContentAsCodeProjectSettingsModel';
import {
    AI_AGENT_KNOWLEDGE_DOCUMENT_SNAPSHOT_TYPE,
    getKnowledgeDocumentSnapshotSlug,
    type ContentAsCodeSnapshotModel,
} from '../../../models/ContentAsCodeSnapshotModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import { buildKnowledgeDocumentSnapshot } from '../../../services/CoderService/contentAsCodeSnapshot';
import { paginateAsCode } from '../../../services/CoderService/pagination';
import {
    type AiAgentDocumentModel,
    type AiAgentOwnedDocument,
} from '../../models/AiAgentDocumentModel';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { type AiAgentSkillModel } from '../../models/AiAgentSkillModel';
import { BuiltInSkills } from '../ai/skills/builtInSkills';
import {
    type AiAgentDocumentScope,
    type AiAgentDocumentService,
} from '../AiAgentDocumentService';
import { type AiAgentSkillService } from '../AiAgentSkillService';
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

const toKnowledgeDocumentAsCode = (
    document: AiAgentOwnedDocument,
): AgentAsCodeKnowledgeDocument => ({
    name: document.name,
    alwaysIncludeInContext: document.alwaysIncludeInContext,
    mimeType:
        document.mimeType === 'text/plain' ? 'text/plain' : 'text/markdown',
    content: document.content,
});

const contentBytes = (content: string): number =>
    Buffer.byteLength(content, 'utf8');

const normalizeKnowledgeDocument = (
    document: AgentAsCodeKnowledgeDocument,
): AgentAsCodeKnowledgeDocument => ({
    ...document,
    name: normalizeAiAgentDocumentName(document.name),
});

type KnowledgeDocumentStep =
    | {
          kind: 'apply';
          document: AgentAsCodeKnowledgeDocument;
          existing: AiAgentOwnedDocument | undefined;
      }
    | { kind: 'remove'; existing: AiAgentOwnedDocument };

type KnowledgeDocumentSyncContext = {
    user: SessionUser;
    scope: AiAgentDocumentScope;
    agentSlug: string;
    force: boolean;
    syncEnabled: boolean;
};

// Stored names are matched trimmed so a UI-created "Foo " and a repo "Foo"
// are the same document.
const planKnowledgeDocuments = (
    declared: AgentAsCodeKnowledgeDocument[],
    owned: AiAgentOwnedDocument[],
): KnowledgeDocumentStep[] => {
    const existingByName = new Map(
        owned.map((document) => [document.name.trim(), document]),
    );
    const declaredNames = new Set(declared.map(({ name }) => name));
    return [
        ...declared.map(
            (document): KnowledgeDocumentStep => ({
                kind: 'apply',
                document,
                existing: existingByName.get(document.name),
            }),
        ),
        ...owned
            .filter((existing) => !declaredNames.has(existing.name.trim()))
            .map(
                (existing): KnowledgeDocumentStep => ({
                    kind: 'remove',
                    existing,
                }),
            ),
    ];
};

const toAgentAsCode = (
    agent: AgentForCode,
    evaluations: EvaluationForCode[],
    skills: string[] | null,
    knowledgeDocuments: AgentAsCodeKnowledgeDocument[] | null,
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
    enableSqlAutoApproval: agent.enableSqlAutoApproval,
    enableComposerQueries: agent.enableComposerQueries,
    // Omit rather than export null: a dumped `threadRetentionHours: null` in
    // every YAML would trip the flag-off warning on each re-upload.
    threadRetentionHours: agent.threadRetentionHours ?? undefined,
    modelConfig: agent.modelConfig,
    ...(skills !== null ? { skills: [...skills].sort() } : {}),
    ...(knowledgeDocuments !== null ? { knowledgeDocuments } : {}),
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
    enableSqlAutoApproval: agent.enableSqlAutoApproval ?? false,
    enableComposerQueries: agent.enableComposerQueries ?? true,
    ...(includeThreadRetention
        ? { threadRetentionHours: agent.threadRetentionHours ?? null }
        : {}),
    modelConfig: agent.modelConfig,
});

type Dependencies = {
    aiAgentModel: AiAgentModel;
    aiAgentSkillModel: AiAgentSkillModel;
    aiAgentSkillService: AiAgentSkillService;
    aiAgentDocumentModel: AiAgentDocumentModel;
    aiAgentDocumentService: AiAgentDocumentService;
    contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;
    contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;
    projectModel: ProjectModel;
    lightdashConfig: LightdashConfig;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
};

export class AiAgentCoderService extends BaseService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly aiAgentSkillModel: AiAgentSkillModel;

    private readonly aiAgentSkillService: AiAgentSkillService;

    private readonly aiAgentDocumentModel: AiAgentDocumentModel;

    private readonly aiAgentDocumentService: AiAgentDocumentService;

    private readonly contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;

    private readonly contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;

    private readonly projectModel: ProjectModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly aiOrganizationSettingsService: AiOrganizationSettingsService;

    constructor({
        aiAgentModel,
        aiAgentSkillModel,
        aiAgentSkillService,
        aiAgentDocumentModel,
        aiAgentDocumentService,
        contentAsCodeProjectSettingsModel,
        contentAsCodeSnapshotModel,
        projectModel,
        lightdashConfig,
        aiOrganizationSettingsService,
    }: Dependencies) {
        super({ serviceName: 'AiAgentCoderService' });
        this.aiAgentModel = aiAgentModel;
        this.aiAgentSkillModel = aiAgentSkillModel;
        this.aiAgentSkillService = aiAgentSkillService;
        this.aiAgentDocumentModel = aiAgentDocumentModel;
        this.aiAgentDocumentService = aiAgentDocumentService;
        this.contentAsCodeProjectSettingsModel =
            contentAsCodeProjectSettingsModel;
        this.contentAsCodeSnapshotModel = contentAsCodeSnapshotModel;
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
        const skillsEnabled = await this.aiAgentSkillService.isEnabled(
            fromSession(user),
        );
        const skillNamesByAgentUuid = new Map(
            await Promise.all(
                page.page.map(
                    async ({ uuid }) =>
                        [
                            uuid,
                            (
                                await this.aiAgentSkillModel.findBoundToAgent(
                                    uuid,
                                )
                            ).map((skill) => skill.name),
                        ] as const,
                ),
            ),
        );

        const knowledgeDocumentsByAgentUuid = new Map(
            await Promise.all(
                page.page.map(
                    async ({ uuid }) =>
                        [
                            uuid,
                            (
                                await this.aiAgentDocumentModel.findOwnedByAgent(
                                    {
                                        organizationUuid,
                                        projectUuid,
                                        agentUuid: uuid,
                                    },
                                )
                            ).map(toKnowledgeDocumentAsCode),
                        ] as const,
                ),
            ),
        );

        return {
            agents: page.page.map((agent) =>
                toAgentAsCode(
                    agent,
                    evaluationsByAgentUuid.get(agent.uuid) ?? [],
                    skillsEnabled
                        ? (skillNamesByAgentUuid.get(agent.uuid) ?? [])
                        : null,
                    knowledgeDocumentsByAgentUuid.get(agent.uuid) ?? [],
                ),
            ),
            missingIds,
            total: page.total,
            offset: page.offset,
        };
    }

    /** Built-in names are always on and ignored with a warning; a missing or deleted name fails only this agent. */
    private async resolveDeclaredSkills(
        organizationUuid: string,
        agent: AgentAsCode,
        declared: string[],
        builtInNames: Set<string>,
    ): Promise<
        | {
              ok: true;
              skillUuids: string[];
              names: string[];
              warnings: string[];
          }
        | { ok: false; message: string }
    > {
        const unique = [...new Set(declared)];
        const custom = unique.filter((name) => !builtInNames.has(name));
        const warnings = unique
            .filter((name) => builtInNames.has(name))
            .map(
                (name) =>
                    `AI agent '${agent.slug}': skill '${name}' is built in and always on, so it was ignored`,
            );
        const rows = await Promise.all(
            custom.map(async (name) => ({
                name,
                skill: await this.aiAgentSkillModel.findByName({
                    organizationUuid,
                    name,
                }),
            })),
        );
        const missing = rows.filter(({ skill }) => !skill || skill.deletedAt);
        if (missing.length > 0) {
            return {
                ok: false,
                message: `AI agent '${agent.slug}' references skills that do not exist: ${missing
                    .map(({ name, skill }) =>
                        skill?.deletedAt
                            ? `${name} (deleted; restore it in the skills library)`
                            : name,
                    )
                    .join(
                        ', ',
                    )}. Add them to the skills folder or remove them from the agent.`,
            };
        }
        return {
            ok: true,
            skillUuids: rows.flatMap(({ skill }) =>
                skill ? [skill.uuid] : [],
            ),
            names: rows.map(({ name }) => name),
            warnings,
        };
    }

    private async stampKnowledgeDocument(
        { user, scope, agentSlug, syncEnabled }: KnowledgeDocumentSyncContext,
        document: AgentAsCodeKnowledgeDocument,
    ): Promise<void> {
        if (!syncEnabled) return;
        const { snapshot, snapshotHash } =
            buildKnowledgeDocumentSnapshot(document);
        await this.contentAsCodeSnapshotModel.upsert({
            projectUuid: scope.projectUuid,
            contentType: AI_AGENT_KNOWLEDGE_DOCUMENT_SNAPSHOT_TYPE,
            slug: getKnowledgeDocumentSnapshotSlug(agentSlug, document.name),
            snapshot,
            snapshotHash,
            appliedByUserUuid: user.userUuid,
            filePath: null,
        });
    }

    /** Returns whether the step changed anything on the server. */
    private async applyKnowledgeDocumentStep(
        context: KnowledgeDocumentSyncContext,
        step: KnowledgeDocumentStep,
    ): Promise<boolean> {
        const { user, scope, agentSlug, force } = context;
        if (step.kind === 'remove') {
            await this.aiAgentDocumentService.deleteDocument(
                user,
                scope,
                step.existing.uuid,
                'repo',
            );
            return true;
        }
        const { document, existing } = step;
        if (!existing) {
            const created = await this.aiAgentDocumentService.createDocument(
                user,
                scope,
                {
                    name: document.name,
                    originalFilename: `${document.name}${getAiAgentDocumentFileExtension(document.mimeType)}`,
                    mimeType: document.mimeType,
                    content: document.content,
                },
            );
            if (document.alwaysIncludeInContext) {
                await this.aiAgentDocumentService.updateDocument(
                    user,
                    scope,
                    created.uuid,
                    { alwaysIncludeInContext: true },
                    'repo',
                );
            }
            await this.stampKnowledgeDocument(context, document);
            return true;
        }
        const contentChanged =
            force ||
            existing.content !== document.content ||
            existing.mimeType !== document.mimeType;
        const usageChanged =
            existing.alwaysIncludeInContext !== document.alwaysIncludeInContext;
        if (contentChanged) {
            await this.aiAgentDocumentService.updateDocumentContent(
                user,
                scope,
                existing.uuid,
                {
                    name: document.name,
                    content: document.content,
                    mimeType: document.mimeType,
                },
                'repo',
            );
        }
        if (usageChanged) {
            await this.aiAgentDocumentService.updateDocument(
                user,
                scope,
                existing.uuid,
                { alwaysIncludeInContext: document.alwaysIncludeInContext },
                'repo',
            );
        }
        await this.stampKnowledgeDocument(context, document);
        return contentChanged || usageChanged;
    }

    // Steps run one after another: each create checks the organization quota
    // against what the previous one stored.
    private async syncKnowledgeDocuments(
        context: KnowledgeDocumentSyncContext,
        declared: AgentAsCodeKnowledgeDocument[],
        owned: AiAgentOwnedDocument[],
    ): Promise<boolean> {
        const results = await planKnowledgeDocuments(declared, owned).reduce<
            Promise<boolean[]>
        >(
            async (previous, step) => [
                ...(await previous),
                await this.applyKnowledgeDocumentStep(context, step),
            ],
            Promise.resolve([]),
        );
        return results.some(Boolean);
    }

    // The whole upload is sized against the quota before any write, so an
    // agent is never left with some of its documents applied.
    private async assertDocumentQuota(
        organizationUuid: string,
        agents: AgentAsCode[],
        ownedDocumentsBySlug: Map<string, AiAgentOwnedDocument[]>,
    ): Promise<void> {
        if (agents.length === 0) return;
        const sum = (values: number[]) =>
            values.reduce((total, value) => total + value, 0);
        const incomingBytes = sum(
            agents.flatMap((agent) =>
                (agent.knowledgeDocuments ?? []).map(({ content }) =>
                    contentBytes(content),
                ),
            ),
        );
        const replacedBytes = sum(
            [...ownedDocumentsBySlug.values()].flatMap((owned) =>
                owned.map(({ contentSizeBytes }) => contentSizeBytes),
            ),
        );
        const storedBytes =
            await this.aiAgentDocumentModel.getOrganizationContentSize(
                organizationUuid,
            );
        const projectedBytes = storedBytes - replacedBytes + incomingBytes;
        if (projectedBytes > AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES) {
            throw new ParameterError(
                `Knowledge documents would exceed the organization quota of ${AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES} bytes (${projectedBytes} bytes after upload)`,
            );
        }
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
            const documentNames = (agent.knowledgeDocuments ?? []).map(
                ({ name }) => {
                    try {
                        return normalizeAiAgentDocumentName(name);
                    } catch (error) {
                        throw new ParameterError(
                            `AI agent '${agent.slug}': ${getErrorMessage(error)}`,
                        );
                    }
                },
            );
            // Checked before any write so an oversized file never leaves the
            // agent half applied.
            const oversized = (agent.knowledgeDocuments ?? []).find(
                ({ content }) =>
                    contentBytes(content) > AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
            );
            if (oversized) {
                throw new ParameterError(
                    `AI agent '${agent.slug}': knowledge document '${oversized.name}' exceeds the ${AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES} byte limit`,
                );
            }
            const duplicateDocumentNames = documentNames.filter(
                (name, index, names) => names.indexOf(name) !== index,
            );
            if (duplicateDocumentNames.length > 0) {
                throw new ParameterError(
                    `Duplicate knowledge document names for AI agent '${agent.slug}': ${[
                        ...new Set(duplicateDocumentNames),
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
        const account = fromSession(user);
        const skillsEnabled = await this.aiAgentSkillService.isEnabled(account);
        const builtInSkillNames = new Set(await BuiltInSkills.getAllNames());
        agents.forEach((agent) => {
            if (agent.skills !== undefined && !skillsEnabled) {
                warnings.push(
                    `AI agent '${agent.slug}': skills were ignored — custom agent skills are not enabled for this organization`,
                );
            }
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
        // `warnings` is shared with the loop below, so it is attached once at
        // the end rather than spread here.
        const changes: AgentAsCodeUpsertChanges = {
            created: [],
            updated: [],
            unchanged: [],
            deleted: [],
        };
        const agentsWithDocuments = agents.filter(
            (agent) => agent.knowledgeDocuments !== undefined,
        );
        const syncEnabled =
            agentsWithDocuments.length > 0 &&
            (await this.contentAsCodeProjectSettingsModel.get(projectUuid))
                ?.syncEnabled === true;
        const ownedDocumentsBySlug = new Map(
            await Promise.all(
                agentsWithDocuments.flatMap((agent) => {
                    const existing = existingBySlug.get(agent.slug);
                    return existing
                        ? [
                              this.aiAgentDocumentModel
                                  .findOwnedByAgent({
                                      organizationUuid,
                                      projectUuid,
                                      agentUuid: existing.uuid,
                                  })
                                  .then(
                                      (owned) => [agent.slug, owned] as const,
                                  ),
                          ]
                        : [];
                }),
            ),
        );
        await this.assertDocumentQuota(
            organizationUuid,
            agentsWithDocuments,
            ownedDocumentsBySlug,
        );

        const upsertOne = async (agent: AgentAsCode): Promise<void> => {
            const existing = existingBySlug.get(agent.slug);
            let agentUuid: string;
            let agentChanged = false;
            const declaredSkills =
                agent.skills !== undefined && skillsEnabled
                    ? await this.resolveDeclaredSkills(
                          organizationUuid,
                          agent,
                          agent.skills,
                          builtInSkillNames,
                      )
                    : null;
            if (declaredSkills && !declaredSkills.ok) {
                changes.failed = [
                    ...(changes.failed ?? []),
                    { slug: agent.slug, message: declaredSkills.message },
                ];
                return;
            }
            if (declaredSkills) warnings.push(...declaredSkills.warnings);
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
                            toAgentAsCode(existing, [], null, null),
                            retentionDeclared,
                        ),
                        getComparableAgent(agent, retentionDeclared),
                    );

                if (!isUnchanged) {
                    // The credential pin is not managed as code, but the model
                    // is; refuse a model the pinned credential cannot serve
                    // rather than leaving the agent broken at its next prompt.
                    // Only when the model changes: a broken pin must not block
                    // unrelated as-code updates to the agent.
                    const modelConfigChanged = !isEqual(
                        agent.modelConfig ?? null,
                        existing.modelConfig ?? null,
                    );
                    const pinnedCredentialUuid = modelConfigChanged
                        ? await this.aiAgentModel.findProviderCredentialUuid(
                              existing.uuid,
                          )
                        : null;
                    if (pinnedCredentialUuid) {
                        try {
                            await this.aiOrganizationSettingsService.validateAgentProviderCredential(
                                organizationUuid,
                                pinnedCredentialUuid,
                                agent.modelConfig,
                            );
                        } catch (error) {
                            changes.failed = [
                                ...(changes.failed ?? []),
                                {
                                    slug: agent.slug,
                                    message: `AI agent '${agent.slug}': ${getErrorMessage(error)}`,
                                },
                            ];
                            return;
                        }
                    }
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
                        enableSqlAutoApproval:
                            agent.enableSqlAutoApproval ?? false,
                        enableComposerQueries:
                            agent.enableComposerQueries ?? true,
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
                    enableSqlAutoApproval: agent.enableSqlAutoApproval ?? false,
                    enableComposerQueries: agent.enableComposerQueries ?? true,
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

            if (declaredSkills) {
                const bound =
                    await this.aiAgentSkillModel.findBoundToAgent(agentUuid);
                const currentNames = bound.map(({ name }) => name).sort();
                if (!isEqual(currentNames, [...declaredSkills.names].sort())) {
                    try {
                        await this.aiAgentSkillService.setAgentSkills(account, {
                            projectUuid,
                            agentUuid,
                            skillUuids: declaredSkills.skillUuids,
                        });
                    } catch (error) {
                        changes.failed = [
                            ...(changes.failed ?? []),
                            {
                                slug: agent.slug,
                                message: `AI agent '${agent.slug}': skills could not be bound — ${getErrorMessage(error)}`,
                            },
                        ];
                        return;
                    }
                    agentChanged = true;
                }
            }

            if (agent.knowledgeDocuments !== undefined) {
                try {
                    const documentsChanged = await this.syncKnowledgeDocuments(
                        {
                            user,
                            scope: { projectUuid, agentUuid },
                            agentSlug: agent.slug,
                            force,
                            syncEnabled,
                        },
                        agent.knowledgeDocuments.map(
                            normalizeKnowledgeDocument,
                        ),
                        ownedDocumentsBySlug.get(agent.slug) ?? [],
                    );
                    agentChanged = agentChanged || documentsChanged;
                } catch (error) {
                    changes.failed = [
                        ...(changes.failed ?? []),
                        {
                            slug: agent.slug,
                            message: `AI agent '${agent.slug}': knowledge documents could not be applied — ${getErrorMessage(error)}`,
                        },
                    ];
                    return;
                }
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
        };

        for (const agent of agents) {
            // eslint-disable-next-line no-await-in-loop
            await upsertOne(agent);
        }

        return {
            ...changes,
            ...(warnings.length > 0 ? { warnings } : {}),
        };
    }
}
