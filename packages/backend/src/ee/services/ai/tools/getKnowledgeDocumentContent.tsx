import { getKnowledgeDocumentContentToolDefinition } from '@lightdash/common';
import type { GetKnowledgeDocumentContentFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    getKnowledgeDocumentContent: GetKnowledgeDocumentContentFn;
};

const toolDefinition = getKnowledgeDocumentContentToolDefinition.for('ai-sdk');

export const getGetKnowledgeDocumentContent = ({
    getKnowledgeDocumentContent,
}: Dependencies) =>
    toolDefinition.build({
        execute: async ({ documentUuid }) => {
            try {
                const document = await getKnowledgeDocumentContent({
                    documentUuid,
                });
                return {
                    status: 'success' as const,
                    type: 'string' as const,
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
                        contentSizeBytes: Buffer.byteLength(
                            document.content,
                            'utf8',
                        ),
                    },
                };
            } catch (e) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        e,
                        'Error reading knowledge document.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
    });
