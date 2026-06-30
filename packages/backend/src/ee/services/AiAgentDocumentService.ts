import { subject } from '@casl/ability';
import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
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

        const projectExplores = await this.getProjectExploresForSummarization(
            user,
            body,
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
        let summary: AiAgentDocument['summary'];
        try {
            summary = await generateDocumentSummary(modelOptions, {
                name: body.name,
                content: body.content,
                projectExplores,
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
