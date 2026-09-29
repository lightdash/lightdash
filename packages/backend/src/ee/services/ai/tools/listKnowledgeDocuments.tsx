import {
    AiAgentDocumentSummary,
    listKnowledgeDocumentsToolDefinition,
    ToolListKnowledgeDocumentsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListKnowledgeDocumentsFn } from '../types/aiAgentDependencies';
import { renderKnowledgeDocumentSummary } from '../utils/renderKnowledgeDocumentSummary';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { escapeXmlText, xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listKnowledgeDocuments: ListKnowledgeDocumentsFn;
};

type DocumentEntry =
    ToolListKnowledgeDocumentsStructuredContent['documents'][number];

const toolDefinition = listKnowledgeDocumentsToolDefinition.for('agent');

const toDocumentEntry = (doc: AiAgentDocumentSummary): DocumentEntry => ({
    uuid: doc.uuid,
    name: doc.name,
    sizeBytes: doc.contentSizeBytes,
});

const renderDocument = (doc: AiAgentDocumentSummary) => (
    <document
        uuid={doc.uuid}
        sizeBytes={doc.contentSizeBytes}
        relevance={doc.summary.relevance}
    >
        <name>{escapeXmlText(doc.name)}</name>
        {renderKnowledgeDocumentSummary(doc.summary)}
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
                const documents = await listKnowledgeDocuments();
                return {
                    result: (
                        <knowledgedocuments count={documents.length}>
                            {documents.map(renderDocument)}
                        </knowledgedocuments>
                    ).toString(),
                    metadata: { status: 'success' },
                    structuredContent: {
                        count: documents.length,
                        documents: documents.map(toDocumentEntry),
                    },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error listing knowledge documents.');
            }
        },
    });
