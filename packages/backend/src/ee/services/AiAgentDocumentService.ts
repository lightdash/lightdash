import { subject } from '@casl/ability';
import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    AI_AGENT_DOCUMENT_MAX_FILE_BYTES,
    AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES,
    AiAgentDocument,
    AiAgentDocumentSummary,
    ApiCreateAiAgentDocument,
    CommercialFeatureFlags,
    Explore,
    ForbiddenError,
    ParameterError,
    PayloadTooLargeError,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { v4 as uuidv4 } from 'uuid';
import {
    AiAgentDocumentCreatedEvent,
    AiAgentDocumentDeletedEvent,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { BaseService } from '../../services/BaseService';
import { AiAgentDocumentModel } from '../models/AiAgentDocumentModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import { generateDocumentSummary } from './ai/agents/documentSummaryGenerator';
import { getModel } from './ai/models';
import {
    extractAiAgentDocumentText,
    normalizeAiAgentDocumentMimeType,
    normalizeExtractedDocumentText,
} from './aiAgentDocumentExtractor';
import type { AiAgentService } from './AiAgentService/AiAgentService';

const assertOrganizationUuid = (user: SessionUser): string => {
    if (!user.organizationUuid) {
        throw new ForbiddenError('User must belong to an organization');
    }
    return user.organizationUuid;
};

const stripExtension = (filename: string): string =>
    filename.replace(/\.[^.]+$/, '');

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
        body: ApiCreateAiAgentDocument,
    ): Promise<Explore[]> {
        const primaryAgentUuid = body.agentAccess?.[0];
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
            if (body.projectUuid) {
                return await this.aiAgentService.getAvailableExplores(
                    user,
                    body.projectUuid,
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

    private static async readUploadBody(input: {
        body: Readable;
        contentLength: number;
    }): Promise<Buffer> {
        if (input.contentLength > AI_AGENT_DOCUMENT_MAX_FILE_BYTES) {
            throw new PayloadTooLargeError(
                `File exceeds the ${AI_AGENT_DOCUMENT_MAX_FILE_BYTES} byte limit.`,
                {
                    contentSizeBytes: input.contentLength,
                    maxBytes: AI_AGENT_DOCUMENT_MAX_FILE_BYTES,
                },
            );
        }

        const chunks: Buffer[] = [];
        let total = 0;
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of input.body) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > AI_AGENT_DOCUMENT_MAX_FILE_BYTES) {
                throw new PayloadTooLargeError(
                    `File exceeds the ${AI_AGENT_DOCUMENT_MAX_FILE_BYTES} byte limit.`,
                    {
                        contentSizeBytes: total,
                        maxBytes: AI_AGENT_DOCUMENT_MAX_FILE_BYTES,
                    },
                );
            }
            chunks.push(buffer);
        }

        const rawBody = Buffer.concat(chunks);
        if (rawBody.length === 0) {
            throw new ParameterError('Upload body is empty');
        }
        return rawBody;
    }

    private async createDocumentWithContent(
        user: SessionUser,
        body: ApiCreateAiAgentDocument & { storageExtension?: string },
    ): Promise<AiAgentDocument> {
        const organizationUuid = assertOrganizationUuid(user);
        await this.assertCopilotEnabled(user);
        this.assertCanManageDocuments(
            user,
            organizationUuid,
            body.projectUuid ?? null,
        );

        const content = normalizeExtractedDocumentText(body.content);
        if (content.length === 0) {
            throw new ParameterError('Document content cannot be empty.');
        }

        const contentBytes = Buffer.byteLength(content, 'utf8');
        if (contentBytes > AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES) {
            throw new PayloadTooLargeError(
                `Extracted text exceeds the ${AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES} byte limit.`,
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

        const documentType = normalizeAiAgentDocumentMimeType(
            body.mimeType,
            body.originalFilename,
        );
        const storageExtension =
            body.storageExtension ?? documentType.storageExtension;

        const projectExplores = await this.getProjectExploresForSummarization(
            user,
            body,
        );
        const modelOptions = getModel(this.lightdashConfig.ai.copilot, {
            enableReasoning: false,
            useFastModel: true,
        });
        const summary = await generateDocumentSummary(modelOptions, {
            name: body.name,
            content,
            projectExplores,
        });

        const storageKey = `org/${organizationUuid}/doc/${uuidv4()}.${storageExtension}`;

        const document = await this.aiAgentDocumentModel.create({
            organizationUuid,
            projectUuid: body.projectUuid ?? null,
            name: body.name,
            originalFilename: body.originalFilename,
            mimeType: documentType.mimeType,
            content,
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

    async createDocument(
        user: SessionUser,
        body: ApiCreateAiAgentDocument,
    ): Promise<AiAgentDocument> {
        return this.createDocumentWithContent(user, body);
    }

    async uploadDocument(
        user: SessionUser,
        input: {
            originalFilename: string;
            name?: string;
            mimeType: string;
            body: Readable;
            contentLength: number;
            projectUuid?: string | null;
            agentAccess?: string[];
        },
    ): Promise<AiAgentDocument> {
        const rawBody = await AiAgentDocumentService.readUploadBody({
            body: input.body,
            contentLength: input.contentLength,
        });
        let extracted: Awaited<ReturnType<typeof extractAiAgentDocumentText>>;
        try {
            extracted = await extractAiAgentDocumentText({
                buffer: rawBody,
                filename: input.originalFilename,
                mimeType: input.mimeType,
            });
        } catch (e) {
            if (e instanceof ParameterError) {
                throw e;
            }
            throw new ParameterError(
                'Could not read text from this document. Check that it is not password-protected or image-only.',
            );
        }

        return this.createDocumentWithContent(user, {
            name: input.name?.trim() || stripExtension(input.originalFilename),
            originalFilename: input.originalFilename,
            mimeType: extracted.mimeType,
            content: extracted.content,
            projectUuid: input.projectUuid,
            agentAccess: input.agentAccess,
            storageExtension: extracted.storageExtension,
        });
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
