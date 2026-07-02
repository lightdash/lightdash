import { subject } from '@casl/ability';
import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES,
    AiAgentDocument,
    AiAgentDocumentContent,
    AiAgentDocumentSummary,
    ApiCreateAiAgentDocument,
    ApiUpdateAiAgentDocument,
    CommercialFeatureFlags,
    Explore,
    ForbiddenError,
    ParameterError,
    PayloadTooLargeError,
    type SessionUser,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import {
    AiAgentDocumentCreatedEvent,
    AiAgentDocumentDeletedEvent,
    AiAgentDocumentUpdatedEvent,
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

type AiAgentDocumentServiceDependencies = {
    analytics: LightdashAnalytics;
    aiAgentDocumentModel: AiAgentDocumentModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
    aiAgentService: AiAgentService;
    lightdashConfig: LightdashConfig;
};

export class AiAgentDocumentService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly aiAgentDocumentModel: AiAgentDocumentModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    private readonly aiAgentService: AiAgentService;

    private readonly lightdashConfig: LightdashConfig;

    constructor(dependencies: AiAgentDocumentServiceDependencies) {
        super();
        this.analytics = dependencies.analytics;
        this.aiAgentDocumentModel = dependencies.aiAgentDocumentModel;
        this.commercialFeatureFlagModel =
            dependencies.commercialFeatureFlagModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.lightdashConfig = dependencies.lightdashConfig;
    }

    /**
     * Build the explore context used to ground the summary generator. Mirrors
     * what the agent itself sees at conversation time: filtered by the
     * agent's tags AND the user's attributes via
     * AiAgentService.getAvailableExplores. If the upload isn't bound to an
     * agent, falls back to all explores in the project.
     */
    private async getProjectExploresForSummarization(
        user: SessionUser,
        args: { agentUuid?: string; projectUuid: string | null },
    ): Promise<Explore[]> {
        const primaryAgentUuid = args.agentUuid;
        try {
            if (primaryAgentUuid) {
                const agent = await this.aiAgentService.getAgent(
                    user,
                    primaryAgentUuid,
                );
                return await this.aiAgentService.getAvailableExplores(
                    user,
                    agent.projectUuid,
                    agent.tags,
                );
            }
            if (args.projectUuid) {
                return await this.aiAgentService.getAvailableExplores(
                    user,
                    args.projectUuid,
                    null,
                );
            }
            return [];
        } catch (e) {
            this.logger.warn(
                'Failed to fetch project explores for document summarization',
                { error: e },
            );
            return [];
        }
    }

    /**
     * Generate a structured summary grounded in the same explore context the
     * agent sees at conversation time. Falls back to a default summary if the
     * LLM call fails so uploads/edits never hard-fail on summarization.
     */
    private async generateSummary(
        user: SessionUser,
        organizationUuid: string,
        args: {
            name: string;
            content: string;
            agentUuid?: string;
            projectUuid: string | null;
        },
    ): Promise<AiAgentDocument['summary']> {
        const projectExplores = await this.getProjectExploresForSummarization(
            user,
            { agentUuid: args.agentUuid, projectUuid: args.projectUuid },
        );
        const modelOptions = {
            ...getModel(this.lightdashConfig.ai.copilot, {
                enableReasoning: false,
                useFastModel: true,
            }),
            telemetry: {
                organizationUuid,
                userUuid: user.userUuid,
            },
        };
        try {
            return await generateDocumentSummary(modelOptions, {
                name: args.name,
                content: args.content,
                projectExplores,
            });
        } catch (error) {
            this.logger.error(
                `Failed to generate summary for document "${args.name}", storing a fallback summary: ${error}`,
            );
            return createFallbackDocumentSummary(args.name);
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
        projectUuid: string | null = null,
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

    private assertCanManageDocuments(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string | null = null,
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

    private async getDocument(
        user: SessionUser,
        documentUuid: string,
    ): Promise<AiAgentDocument> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        const document = await this.aiAgentDocumentModel.get(documentUuid);
        if (document.organizationUuid !== organizationUuid) {
            throw new ForbiddenError();
        }
        this.assertCanViewDocuments(
            user,
            organizationUuid,
            document.projectUuid,
        );
        return document;
    }

    async getDocumentContent(
        user: SessionUser,
        documentUuid: string,
    ): Promise<AiAgentDocumentContent> {
        // getDocument enforces copilot + org + view permission checks
        await this.getDocument(user, documentUuid);
        return this.aiAgentDocumentModel.getContent(documentUuid);
    }

    async createDocument(
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

        const summary = await this.generateSummary(user, organizationUuid, {
            name: body.name,
            content: body.content,
            agentUuid: body.agentAccess?.[0],
            projectUuid: body.projectUuid ?? null,
        });

        const storageKey = `org/${organizationUuid}/doc/${uuidv4()}.${
            mimeType === 'text/markdown' ? 'md' : 'txt'
        }`;

        const document = await this.aiAgentDocumentModel.create({
            organizationUuid,
            projectUuid: body.projectUuid ?? null,
            name: body.name,
            originalFilename: body.originalFilename,
            mimeType,
            content: body.content,
            summary,
            storageKey,
            agentUuids: body.agentAccess ?? [],
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
                agentAccessCount: body.agentAccess?.length ?? 0,
            },
        });

        return document;
    }

    async updateDocument(
        user: SessionUser,
        documentUuid: string,
        body: ApiUpdateAiAgentDocument,
    ): Promise<AiAgentDocument> {
        const existing = await this.getDocument(user, documentUuid);
        this.assertCanManageDocuments(
            user,
            existing.organizationUuid,
            existing.projectUuid,
        );

        const existingContent =
            await this.aiAgentDocumentModel.getContent(documentUuid);
        const contentChanged =
            body.content !== undefined &&
            body.content !== existingContent.content;

        let summary: AiAgentDocument['summary'] | undefined;
        let newContentSizeBytes = existing.contentSizeBytes;

        if (contentChanged) {
            const content = body.content!;
            const contentBytes = Buffer.byteLength(content, 'utf8');
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
                    existing.organizationUuid,
                );
            const projectedTotal =
                existingTotal - existing.contentSizeBytes + contentBytes;
            if (projectedTotal > AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES) {
                throw new PayloadTooLargeError(
                    `Organization document quota of ${AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES} bytes would be exceeded`,
                    {
                        currentBytes: existingTotal,
                        incomingBytes: contentBytes,
                        quotaBytes: AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES,
                    },
                );
            }

            newContentSizeBytes = contentBytes;
            summary = await this.generateSummary(
                user,
                existing.organizationUuid,
                {
                    name: body.name ?? existing.name,
                    content,
                    agentUuid: existing.agentAccess[0],
                    projectUuid: existing.projectUuid,
                },
            );
        }

        const updated = await this.aiAgentDocumentModel.update({
            uuid: documentUuid,
            name: body.name,
            content: contentChanged ? body.content : undefined,
            summary,
            updatedByUserUuid: user.userUuid,
        });

        this.analytics.track<AiAgentDocumentUpdatedEvent>({
            event: 'ai_agent_document.updated',
            userId: user.userUuid,
            properties: {
                organizationId: existing.organizationUuid,
                projectId: existing.projectUuid,
                documentId: documentUuid,
                contentChanged,
                contentSizeBytes: newContentSizeBytes,
            },
        });

        return updated;
    }

    async deleteDocument(
        user: SessionUser,
        documentUuid: string,
    ): Promise<void> {
        const existing = await this.getDocument(user, documentUuid);
        this.assertCanManageDocuments(
            user,
            existing.organizationUuid,
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
