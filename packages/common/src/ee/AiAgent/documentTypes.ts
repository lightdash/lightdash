export const AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES = 100 * 1024;
export const AI_AGENT_DOCUMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES = 5 * 1024 * 1024;
export const AI_AGENT_DOCUMENT_SUPPORTED_FILE_EXTENSIONS = [
    '.md',
    '.markdown',
    '.txt',
    '.csv',
    '.docx',
    '.doc',
    '.pdf',
] as const;

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
    summary: AiAgentDocumentStructuredSummary;
    storageKey: string;
    agentAccess: string[];
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AiAgentDocumentSummary = Omit<AiAgentDocument, 'storageKey'>;

export type AiAgentDocumentContent = Pick<
    AiAgentDocument,
    'uuid' | 'name' | 'mimeType'
> & {
    content: string;
};

export type ApiCreateAiAgentDocument = {
    name: string;
    originalFilename: string;
    mimeType: string;
    content: string;
    projectUuid?: string | null;
    agentAccess?: string[];
};

export type ApiUpdateAiAgentDocument = {
    name?: string;
    projectUuid?: string | null;
    agentAccess?: string[];
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
