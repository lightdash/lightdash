import {
    AiAgentDocumentSummary,
    listKnowledgeDocumentsToolDefinition,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListKnowledgeDocumentsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listKnowledgeDocuments: ListKnowledgeDocumentsFn;
};

const toolDefinition = listKnowledgeDocumentsToolDefinition.for('agent');

const renderDocument = (doc: AiAgentDocumentSummary) => (
    <document uuid={doc.uuid} sizeBytes={doc.contentSizeBytes}>
        <name>{doc.name}</name>
        <summary>{doc.summary}</summary>
    </document>
);

export const getListKnowledgeDocuments = ({
    listKnowledgeDocuments,
}: Dependencies) =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
        execute: async () => {
            try {
                const documents = await listKnowledgeDocuments();
                return {
                    result: (
                        <knowledgedocuments count={documents.length}>
                            {documents.map(renderDocument)}
                        </knowledgedocuments>
                    ).toString(),
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error listing knowledge documents.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
    });
