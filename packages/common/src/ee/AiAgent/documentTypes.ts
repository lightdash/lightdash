export const AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES = 20 * 1024;
export const AI_AGENT_DOCUMENT_MAX_NAME_LENGTH = 255;
export const AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES = 5 * 1024 * 1024;

export type AiAgentDocumentRelevance = 'high' | 'medium' | 'low' | 'none';

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
};

export type ApiAiAgentDocumentResponse = {
    status: 'ok';
    results: AiAgentDocument;
};

export type ApiAiAgentDocumentSummaryListResponse = {
    status: 'ok';
    results: AiAgentDocumentSummary[];
};

export type ApiAiAgentDocumentContentResponse = {
    status: 'ok';
    results: AiAgentDocumentContent;
};
