import {
    getKnowledgeDocumentContentToolDefinition,
    type ToolGetKnowledgeDocumentContentArgs,
    type ToolGetKnowledgeDocumentContentOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetKnowledgeDocumentContentFn } from '../types/aiAgentDependencies';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    getKnowledgeDocumentContent: GetKnowledgeDocumentContentFn;
};

const toolDefinition = getKnowledgeDocumentContentToolDefinition.for('agent');

export const executeGetKnowledgeDocumentContent = async (
    { getKnowledgeDocumentContent }: Dependencies,
    { documentUuid }: ToolGetKnowledgeDocumentContentArgs,
): Promise<ToolGetKnowledgeDocumentContentOutput> => {
    try {
        const document = await getKnowledgeDocumentContent({ documentUuid });
        return {
            result: (
                <knowledgedocument
                    uuid={document.uuid}
                    mimeType={document.mimeType}
                >
                    <name>{document.name}</name>
                    <content>{document.content}</content>
                </knowledgedocument>
            ).toString(),
            metadata: {
                status: 'success',
                name: document.name,
                contentSizeBytes: Buffer.byteLength(document.content, 'utf8'),
            },
            structuredContent: {
                uuid: document.uuid,
                name: document.name,
                mimeType: document.mimeType,
                content: document.content,
            },
        };
    } catch (e) {
        return toolErrorOutput(e, 'Error reading knowledge document.');
    }
};

export const getGetKnowledgeDocumentContent = (dependencies: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: (args) =>
            executeGetKnowledgeDocumentContent(dependencies, args),
    });
