import { subject } from '@casl/ability';
import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES,
    AiAgent,
    AiAgentDocument,
    AiAgentDocumentSummary,
    ApiCreateAgentDocument,
    ApiCreateAiAgentDocument,
    ApiUpdateAgentDocument,
    CommercialFeatureFlags,
    Explore,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    PayloadTooLargeError,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import {
    AiAgentDocumentCreatedEvent,
    AiAgentDocumentDeletedEvent,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { BaseService } from '../../services/BaseService';
import { AiAgentDocumentModel } from '../models/AiAgentDocumentModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import {
    createFallbackDocumentSummary,
    generateDocumentSummary,
} from './ai/agents/documentSummaryGenerator';
import { getModel } from './ai/models';
import { OrgAiCopilotConfigResolver } from './ai/OrgAiCopilotConfigResolver';
import type { AiAgentService } from './AiAgentService/AiAgentService';

const ALLOWED_MIME_TYPES = new Set([
    'text/markdown',
    'text/x-markdown',
    'text/plain',
]);

const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.txt'];

const assertOrganizationUuid = (user: SessionUser): string => {
    if (!user.organizationUuid) {
        throw new ForbiddenError('User must belong to an organization');
    }
    return user.organizationUuid;
};

const normalizeMimeType = (mimeType: string, filename: string): string => {
    const lower = mimeType.toLowerCase();
    if (ALLOWED_MIME_TYPES.has(lower)) {
        return lower === 'text/x-markdown' ? 'text/markdown' : lower;
    }
    const filenameLower = filename.toLowerCase();
    if (filenameLower.endsWith('.md') || filenameLower.endsWith('.markdown')) {
        return 'text/markdown';
    }
    if (filenameLower.endsWith('.txt')) {
        return 'text/plain';
    }
    throw new ParameterError(
        `Unsupported file type. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    );
};

export type AiAgentDocumentScope = {
    projectUuid: string;
    agentUuid: string;
};

type AiAgentDocumentServiceDependencies = {
    analytics: LightdashAnalytics;
    aiAgentDocumentModel: AiAgentDocumentModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
    aiAgentService: AiAgentService;
    lightdashConfig: LightdashConfig;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
};

export class AiAgentDocumentService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly aiAgentDocumentModel: AiAgentDocumentModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    private readonly aiAgentService: AiAgentService;

    private readonly lightdashConfig: LightdashConfig;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    constructor(dependencies: AiAgentDocumentServiceDependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.aiAgentDocumentModel = dependencies.aiAgentDocumentModel;
        this.commercialFeatureFlagModel =
            dependencies.commercialFeatureFlagModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.orgAiCopilotConfigResolver =
            dependencies.orgAiCopilotConfigResolver;
    }

    /**
     * Build the explore context used to ground the summary generator. Mirrors
     * what the agent itself sees at conversation time: filtered by the
     * agent's tags AND the user's attributes via
     * AiAgentService.getAvailableExplores.
     */
    private async getAgentExploresForSummarization(
        user: SessionUser,
        agent: AiAgent,
    ): Promise<Explore[]> {
        try {
            return await this.aiAgentService.getAvailableExplores(
                user,
                agent.projectUuid,
                agent.tags,
            );
        } catch (e) {
            this.logger.warn(
                'Failed to fetch project explores for document summarization',
                { error: e },
            );
            return [];
        }
    }

    private async assertCopilotEnabled(user: SessionUser): Promise<void> {
        const flag = await this.commercialFeatureFlagModel.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        if (!flag.enabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }
    }

    private assertCanViewDocuments(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string | null,
    ): void {
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'view',
                subject('AiAgentDocument', {
                    organizationUuid,
                    projectUuid: projectUuid ?? undefined,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    /**
     * A document with no project is org-wide: the project-level rule cannot
     * match a subject without a projectUuid, so managing it needs org-level
     * permission.
     */
    private assertCanManageDocuments(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string | null,
    ): void {
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'manage',
                subject('AiAgentDocument', {
                    organizationUuid,
                    projectUuid: projectUuid ?? undefined,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async listDocuments(
        user: SessionUser,
        { projectUuid, agentUuid }: AiAgentDocumentScope,
    ): Promise<AiAgentDocumentSummary[]> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        this.assertCanViewDocuments(user, organizationUuid, projectUuid);
        // Throws if the agent does not exist in this project
        await this.aiAgentService.getAgent(user, agentUuid, projectUuid);

        return this.aiAgentDocumentModel.findAllForAgent({
            organizationUuid,
            agentUuid,
            projectUuid,
        });
    }

    async createDocument(
        user: SessionUser,
        { projectUuid, agentUuid }: AiAgentDocumentScope,
        body: ApiCreateAgentDocument,
    ): Promise<AiAgentDocument> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        this.assertCanManageDocuments(user, organizationUuid, projectUuid);
        const agent = await this.aiAgentService.getAgent(
            user,
            agentUuid,
            projectUuid,
        );
        const projectExplores = await this.getAgentExploresForSummarization(
            user,
            agent,
        );

        return this.persistDocument(user, organizationUuid, body, {
            projectUuid,
            agentUuids: [agentUuid],
            projectExplores,
        });
    }

    async updateDocument(
        user: SessionUser,
        { projectUuid, agentUuid }: AiAgentDocumentScope,
        documentUuid: string,
        body: ApiUpdateAgentDocument,
    ): Promise<void> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        this.assertCanManageDocuments(user, organizationUuid, projectUuid);
        await this.aiAgentService.getAgent(user, agentUuid, projectUuid);

        const existing = await this.aiAgentDocumentModel.findAccessibleForAgent(
            {
                organizationUuid,
                agentUuid,
                projectUuid,
                documentUuid,
            },
        );
        if (!existing) {
            throw new NotFoundError(
                `AI agent document ${documentUuid} not found`,
            );
        }
        this.assertCanManageDocuments(
            user,
            organizationUuid,
            existing.projectUuid,
        );

        await this.aiAgentDocumentModel.updateAlwaysIncludeInContext({
            documentUuid,
            alwaysIncludeInContext: body.alwaysIncludeInContext,
            updatedByUserUuid: user.userUuid,
        });
    }

    private async persistDocument(
        user: SessionUser,
        organizationUuid: string,
        body: ApiCreateAgentDocument,
        scope: {
            projectUuid: string | null;
            agentUuids: string[];
            projectExplores: Explore[];
        },
    ): Promise<AiAgentDocument> {
        const contentBytes = Buffer.byteLength(body.content, 'utf8');
        if (contentBytes > AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES) {
            throw new PayloadTooLargeError(
                `Content exceeds the ${AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES} byte limit.`,
                {
                    contentSizeBytes: contentBytes,
                    maxBytes: AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
                },
            );
        }

        const existingTotal =
            await this.aiAgentDocumentModel.getOrganizationContentSize(
                organizationUuid,
            );
        if (existingTotal + contentBytes > AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES) {
            throw new PayloadTooLargeError(
                `Organization document quota of ${AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES} bytes would be exceeded`,
                {
                    currentBytes: existingTotal,
                    incomingBytes: contentBytes,
                    quotaBytes: AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES,
                },
            );
        }

        const mimeType = normalizeMimeType(
            body.mimeType,
            body.originalFilename,
        );

        const copilotConfig =
            await this.orgAiCopilotConfigResolver.getCopilotConfig(
                organizationUuid,
            );
        const modelOptions = {
            ...getModel(copilotConfig, {
                enableReasoning: false,
                useFastModel: true,
            }),
            telemetry: {
                organizationUuid,
                userUuid: user.userUuid,
            },
        };
        let summary: AiAgentDocument['summary'];
        try {
            summary = await generateDocumentSummary(modelOptions, {
                name: body.name,
                content: body.content,
                projectExplores: scope.projectExplores,
            });
        } catch (error) {
            this.logger.error(
                `Failed to generate summary for document "${body.name}", storing a fallback summary: ${error}`,
            );
            summary = createFallbackDocumentSummary(body.name);
        }

        const storageKey = `org/${organizationUuid}/doc/${uuidv4()}.${
            mimeType === 'text/markdown' ? 'md' : 'txt'
        }`;

        const document = await this.aiAgentDocumentModel.create({
            organizationUuid,
            projectUuid: scope.projectUuid,
            name: body.name,
            originalFilename: body.originalFilename,
            mimeType,
            content: body.content,
            summary,
            storageKey,
            agentUuids: scope.agentUuids,
            createdByUserUuid: user.userUuid,
        });

        this.analytics.track<AiAgentDocumentCreatedEvent>({
            event: 'ai_agent_document.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: document.projectUuid,
                documentId: document.uuid,
                mimeType: document.mimeType,
                contentSizeBytes: contentBytes,
                agentAccessCount: document.agentAccess.length,
            },
        });

        return document;
    }

    async deleteDocument(
        user: SessionUser,
        { projectUuid, agentUuid }: AiAgentDocumentScope,
        documentUuid: string,
    ): Promise<void> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        this.assertCanManageDocuments(user, organizationUuid, projectUuid);
        await this.aiAgentService.getAgent(user, agentUuid, projectUuid);

        const existing = await this.aiAgentDocumentModel.findAccessibleForAgent(
            {
                organizationUuid,
                agentUuid,
                projectUuid,
                documentUuid,
            },
        );
        if (!existing) {
            throw new NotFoundError(
                `AI agent document ${documentUuid} not found`,
            );
        }
        // An org-wide document outranks the path's project scope
        this.assertCanManageDocuments(
            user,
            organizationUuid,
            existing.projectUuid,
        );

        await this.aiAgentDocumentModel.delete(documentUuid);

        this.analytics.track<AiAgentDocumentDeletedEvent>({
            event: 'ai_agent_document.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: existing.projectUuid,
                documentId: documentUuid,
            },
        });
    }

    /**
     * @deprecated Serves GET /api/v1/aiAgents/documents. Use listDocuments.
     */
    async listOrganizationDocuments(
        user: SessionUser,
        { projectUuid }: { projectUuid?: string | null } = {},
    ): Promise<AiAgentDocumentSummary[]> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        this.assertCanViewDocuments(
            user,
            organizationUuid,
            projectUuid ?? null,
        );
        return this.aiAgentDocumentModel.findAllForOrganization({
            organizationUuid,
            projectUuid,
        });
    }

    /**
     * Resolve the summarization explores from the request body rather than the
     * route, mirroring the pre-deprecation behaviour.
     * @deprecated Serves POST /api/v1/aiAgents/documents.
     */
    private async getBodyScopeExploresForSummarization(
        user: SessionUser,
        body: ApiCreateAiAgentDocument,
        agent: AiAgent | null,
    ): Promise<Explore[]> {
        if (agent) {
            return this.getAgentExploresForSummarization(user, agent);
        }
        if (!body.projectUuid) {
            return [];
        }
        try {
            return await this.aiAgentService.getAvailableExplores(
                user,
                body.projectUuid,
                null,
            );
        } catch (e) {
            this.logger.warn(
                'Failed to fetch project explores for document summarization',
                { error: e },
            );
            return [];
        }
    }

    /**
     * Resolve every agentAccess entry through the org-filtered agent lookup, so
     * an unknown or foreign agent fails the request instead of the FK, and a
     * wrong-project agent cannot be persisted as an access row nothing reads.
     * @deprecated Serves POST /api/v1/aiAgents/documents.
     */
    private async resolveBodyScopeAgents(
        user: SessionUser,
        body: ApiCreateAiAgentDocument,
    ): Promise<AiAgent[]> {
        const agentAccess = body.agentAccess ?? [];
        const { projectUuid } = body;
        return Promise.all(
            agentAccess.map(async (agentUuid) => {
                const agent = await this.aiAgentService.getAgent(
                    user,
                    agentUuid,
                );
                if (projectUuid && agent.projectUuid !== projectUuid) {
                    throw new ParameterError(
                        `Agent ${agentUuid} does not belong to project ${projectUuid}.`,
                    );
                }
                return agent;
            }),
        );
    }

    /**
     * @deprecated Serves POST /api/v1/aiAgents/documents. Use createDocument.
     */
    async createOrganizationDocument(
        user: SessionUser,
        body: ApiCreateAiAgentDocument,
    ): Promise<AiAgentDocument> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        this.assertCanManageDocuments(
            user,
            organizationUuid,
            body.projectUuid ?? null,
        );

        const agents = await this.resolveBodyScopeAgents(user, body);
        const projectExplores = await this.getBodyScopeExploresForSummarization(
            user,
            body,
            agents[0] ?? null,
        );

        return this.persistDocument(user, organizationUuid, body, {
            projectUuid: body.projectUuid ?? null,
            agentUuids: agents.map((agent) => agent.uuid),
            projectExplores,
        });
    }

    /**
     * The path param stays a plain string: tightening it to a uuid pattern is a
     * breaking OpenAPI change, so reject a malformed uuid here instead.
     * @deprecated Serves DELETE /api/v1/aiAgents/documents/{documentUuid}. Use deleteDocument.
     */
    async deleteOrganizationDocument(
        user: SessionUser,
        documentUuid: string,
    ): Promise<void> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        if (!isValidUuid(documentUuid)) {
            throw new ParameterError(`Invalid document uuid: ${documentUuid}`);
        }
        const existing = await this.aiAgentDocumentModel.get(documentUuid);
        if (existing.organizationUuid !== organizationUuid) {
            throw new ForbiddenError();
        }
        this.assertCanManageDocuments(
            user,
            organizationUuid,
            existing.projectUuid,
        );
        await this.aiAgentDocumentModel.delete(documentUuid);

        this.analytics.track<AiAgentDocumentDeletedEvent>({
            event: 'ai_agent_document.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: existing.projectUuid,
                documentId: documentUuid,
            },
        });
    }
}
