import {
    AiAgentDocumentSummary,
    listKnowledgeDocumentsToolDefinition,
    ToolListKnowledgeDocumentsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListKnowledgeDocumentsFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listKnowledgeDocuments: ListKnowledgeDocumentsFn;
};

type DocumentEntry =
    ToolListKnowledgeDocumentsStructuredContent['documents'][number];

type DocumentListing = DocumentEntry & {
    summary: AiAgentDocumentSummary['summary'];
};

const toolDefinition = listKnowledgeDocumentsToolDefinition.for('agent');

const toDocumentListing = (doc: AiAgentDocumentSummary): DocumentListing => ({
    uuid: doc.uuid,
    name: doc.name,
    sizeBytes: doc.contentSizeBytes,
    summary: doc.summary,
});

const toDocumentEntry = ({
    uuid,
    name,
    sizeBytes,
}: DocumentListing): DocumentEntry => ({ uuid, name, sizeBytes });

const renderDocument = (doc: DocumentListing) => (
    <document uuid={doc.uuid} sizeBytes={doc.sizeBytes}>
        <name>{doc.name}</name>
        <summary>{doc.summary}</summary>
    </document>
);

export const getListKnowledgeDocuments = ({
    listKnowledgeDocuments,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (): Promise<
            | ExecuteStructuredToolResult<ToolListKnowledgeDocumentsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const listings = (await listKnowledgeDocuments()).map(
                    toDocumentListing,
                );
                return {
                    result: (
                        <knowledgedocuments count={listings.length}>
                            {listings.map(renderDocument)}
                        </knowledgedocuments>
                    ).toString(),
                    metadata: { status: 'success' },
                    structuredContent: {
                        count: listings.length,
                        documents: listings.map(toDocumentEntry),
                    },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error listing knowledge documents.');
            }
        },
    });
