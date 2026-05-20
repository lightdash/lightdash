import {
    toolGetKnowledgeDocumentContentArgsSchema,
    toolGetKnowledgeDocumentContentOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetKnowledgeDocumentContentFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    getKnowledgeDocumentContent: GetKnowledgeDocumentContentFn;
};

export const getGetKnowledgeDocumentContent = ({
    getKnowledgeDocumentContent,
}: Dependencies) =>
    tool({
        description: toolGetKnowledgeDocumentContentArgsSchema.description,
        inputSchema: toolGetKnowledgeDocumentContentArgsSchema,
        outputSchema: toolGetKnowledgeDocumentContentOutputSchema,
        execute: async ({ documentUuid }) => {
            try {
                const document = await getKnowledgeDocumentContent({
                    documentUuid,
                });
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
                        contentSizeBytes: Buffer.byteLength(
                            document.content,
                            'utf8',
                        ),
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error reading knowledge document.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
    });
