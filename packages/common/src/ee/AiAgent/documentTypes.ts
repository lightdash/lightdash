import { ParameterError } from '../../types/errors';

export const AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES = 20 * 1024;
export const AI_AGENT_DOCUMENT_MAX_NAME_LENGTH = 255;
export const AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES = 5 * 1024 * 1024;

export type AiAgentDocumentRelevance = 'high' | 'medium' | 'low' | 'none';

export type AiAgentDocumentMimeType = 'text/markdown' | 'text/plain';

export const getAiAgentDocumentFileExtension = (
    mimeType: AiAgentDocumentMimeType,
): '.md' | '.txt' => (mimeType === 'text/plain' ? '.txt' : '.md');

export const getAiAgentDocumentMimeType = (
    fileName: string,
): AiAgentDocumentMimeType =>
    fileName.toLowerCase().endsWith('.txt') ? 'text/plain' : 'text/markdown';

/** Trims the name and rejects an empty or over-long one. */
export const normalizeAiAgentDocumentName = (name: string): string => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        throw new ParameterError('Document name cannot be empty');
    }
    if (trimmed.length > AI_AGENT_DOCUMENT_MAX_NAME_LENGTH) {
        throw new ParameterError(
            `Document name cannot exceed ${AI_AGENT_DOCUMENT_MAX_NAME_LENGTH} characters`,
        );
    }
    return trimmed;
};

export type AiAgentDocumentStructuredSummary = {
    description: string;
    definedTerms: string[];
    relatedExploreNames: string[];
    useWhen: string;
    relevance: AiAgentDocumentRelevance;
    warning: string | null;
};

export type AiAgentDocument = {
    uuid: string;
    organizationUuid: string;
    projectUuid: string | null;
    name: string;
    originalFilename: string;
    mimeType: string;
    contentSizeBytes: number;
    alwaysIncludeInContext: boolean;
    summary: AiAgentDocumentStructuredSummary;
    storageKey: string;
    agentAccess: string[];
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AiAgentDocumentSummary = Omit<AiAgentDocument, 'storageKey'>;

export type AiAgentDocumentContext = AiAgentDocumentSummary & {
    content: string | null;
};

export type AiAgentDocumentContent = Pick<
    AiAgentDocument,
    'uuid' | 'name' | 'mimeType'
> & {
    content: string;
};

/**
 * Body of POST /api/v1/aiAgents/documents. Both scope fields are deprecated:
 * scope now comes from the agent-scoped route path. Once they are removed this
 * endpoint only creates organization level documents.
 */
export type ApiCreateAiAgentDocument = {
    name: string;
    originalFilename: string;
    mimeType: string;
    content: string;
    /**
     * @deprecated Use POST /api/v1/projects/{projectUuid}/aiAgents/{agentUuid}/documents, which takes the project from the path
     */
    projectUuid?: string | null;
    /**
     * @deprecated Use POST /api/v1/projects/{projectUuid}/aiAgents/{agentUuid}/documents, which takes the agent from the path
     */
    agentAccess?: string[];
};

/** Body of POST /api/v1/projects/{projectUuid}/aiAgents/{agentUuid}/documents. */
export type ApiCreateAgentDocument = {
    name: string;
    originalFilename: string;
    mimeType: string;
    content: string;
};

export type ApiUpdateAgentDocument = {
    alwaysIncludeInContext: boolean;
};

export type ApiUpdateAgentDocumentContent = {
    name: string;
    content: string;
    // Omitted = keep the stored type
    mimeType?: AiAgentDocumentMimeType;
};

export type ApiAiAgentDocumentResponse = {
    status: 'ok';
    results: AiAgentDocument;
};

// Content as Code last applied this document and the project syncs with
// its repo, so the UI cannot change it.
// An interface so the OpenAPI schema stays a flat object rather than an
// allOf, which the API diff tooling reads as a type change.
export interface AiAgentDocumentListItem extends AiAgentDocumentSummary {
    managedByContentAsCode: boolean;
}

export type ApiAiAgentDocumentSummaryListResponse = {
    status: 'ok';
    results: AiAgentDocumentListItem[];
};

export type ApiAiAgentDocumentContentResponse = {
    status: 'ok';
    results: AiAgentDocumentContent;
};
