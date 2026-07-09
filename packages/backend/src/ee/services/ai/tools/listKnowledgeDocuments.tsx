import {
    AiAgentDocumentSummary,
    listKnowledgeDocumentsToolDefinition,
} from '@lightdash/common';
import type { ListKnowledgeDocumentsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listKnowledgeDocuments: ListKnowledgeDocumentsFn;
};

const toolDefinition = listKnowledgeDocumentsToolDefinition.for('ai-sdk');

const renderDocument = (doc: AiAgentDocumentSummary) => (
    <document uuid={doc.uuid} sizeBytes={doc.contentSizeBytes}>
        <name>{doc.name}</name>
        <summary>{doc.summary}</summary>
    </document>
);

export const getListKnowledgeDocuments = ({
    listKnowledgeDocuments,
}: Dependencies) =>
    toolDefinition.build({
        execute: async () => {
            try {
                const documents = await listKnowledgeDocuments();
                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: (
                        <knowledgedocuments count={documents.length}>
                            {documents.map(renderDocument)}
                        </knowledgedocuments>
                    ).toString(),
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        e,
                        'Error listing knowledge documents.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
    });
