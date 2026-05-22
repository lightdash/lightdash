import { z } from 'zod';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const getToolGetKnowledgeDocumentContentDescription = ({
    name,
    listKnowledgeDocumentsName,
}: {
    name: string;
    listKnowledgeDocumentsName: string;
}) => `Tool: ${name}

Purpose:
Read the full text content of a single knowledge document by its uuid. Use this after ${listKnowledgeDocumentsName} has surfaced a document whose summary looks relevant to the current task.

When to use:
- A summary from ${listKnowledgeDocumentsName} indicates the document contains information you need.
- The user explicitly asks you to read a specific document.

Do NOT use:
- Before calling ${listKnowledgeDocumentsName} — you need a uuid first.
- Repeatedly for the same uuid in one turn — the content does not change between calls.

Parameters:
- documentUuid: The uuid of the document to read, taken from a previous ${listKnowledgeDocumentsName} result.
`;

const toolGetKnowledgeDocumentContentOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            name: z.string(),
            contentSizeBytes: z.number(),
        }),
        z.object({
            status: z.literal('error'),
        }),
    ]),
});

export const getKnowledgeDocumentContentTool = defineTool({
    canonicalName: 'getKnowledgeDocumentContent',
    title: 'Get Knowledge Document Content',
    contexts: ['agent'] as const,
    description: {
        agent: ({ name }) =>
            getToolGetKnowledgeDocumentContentDescription({
                listKnowledgeDocumentsName: 'listKnowledgeDocuments',
                name,
            }),
    },
    buildInputSchemas: {
        agent: ({ createSchema }) =>
            createSchema()
                .extend({
                    documentUuid: z
                        .string()
                        .uuid()
                        .describe('Uuid of the document to read.'),
                })
                .build(),
    },
    outputSchema: toolGetKnowledgeDocumentContentOutputSchema,
});

export type ToolGetKnowledgeDocumentContentArgs = ToolInput<
    typeof getKnowledgeDocumentContentTool,
    'agent'
>;
export type ToolGetKnowledgeDocumentContentOutput = ToolOutput<
    typeof getKnowledgeDocumentContentTool
>;
