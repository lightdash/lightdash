import { subject } from '@casl/ability';
import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    AiAgentDocument,
    AiAgentDocumentContent,
    AiAgentDocumentSummary,
    ApiCreateAiAgentDocument,
    ApiUpdateAiAgentDocument,
    CommercialFeatureFlags,
    ForbiddenError,
    ParameterError,
    PayloadTooLargeError,
    type SessionUser,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../../config/parseConfig';
import { BaseService } from '../../services/BaseService';
import { AiAgentDocumentModel } from '../models/AiAgentDocumentModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import { generateDocumentSummary } from './ai/agents/documentSummaryGenerator';
import { getModel } from './ai/models';

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
    aiAgentDocumentModel: AiAgentDocumentModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
    lightdashConfig: LightdashConfig;
};

export class AiAgentDocumentService extends BaseService {
    private readonly aiAgentDocumentModel: AiAgentDocumentModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    private readonly lightdashConfig: LightdashConfig;

    constructor(dependencies: AiAgentDocumentServiceDependencies) {
        super();
        this.aiAgentDocumentModel = dependencies.aiAgentDocumentModel;
        this.commercialFeatureFlagModel =
            dependencies.commercialFeatureFlagModel;
        this.lightdashConfig = dependencies.lightdashConfig;
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

    async getDocument(
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

        const mimeType = normalizeMimeType(
            body.mimeType,
            body.originalFilename,
        );

        const modelOptions = getModel(this.lightdashConfig.ai.copilot, {
            enableReasoning: false,
            useFastModel: true,
        });
        const summary = await generateDocumentSummary(modelOptions, {
            name: body.name,
            content: body.content,
        });

        const storageKey = `org/${organizationUuid}/doc/${uuidv4()}.${
            mimeType === 'text/markdown' ? 'md' : 'txt'
        }`;

        return this.aiAgentDocumentModel.create({
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
    }

    async updateDocument(
        user: SessionUser,
        documentUuid: string,
        body: ApiUpdateAiAgentDocument,
    ): Promise<AiAgentDocument> {
        const existing = await this.getDocument(user, documentUuid);
        await this.assertCopilotEnabled(user);
        this.assertCanManageDocuments(
            user,
            existing.organizationUuid,
            existing.projectUuid,
        );
        if (
            body.projectUuid !== undefined &&
            body.projectUuid !== existing.projectUuid
        ) {
            this.assertCanManageDocuments(
                user,
                existing.organizationUuid,
                body.projectUuid ?? null,
            );
        }

        return this.aiAgentDocumentModel.update({
            uuid: documentUuid,
            name: body.name,
            projectUuid: body.projectUuid,
            agentUuids: body.agentAccess,
            updatedByUserUuid: user.userUuid,
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
    }
}
