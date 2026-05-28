import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_GET_KNOWLEDGE_DOCUMENT_CONTENT_DESCRIPTION = `Tool: get_knowledge_document_content

Purpose:
Read the full text content of a single knowledge document by its uuid. Use this after list_knowledge_documents has surfaced a document whose summary looks relevant to the current task.

When to use:
- A summary from list_knowledge_documents indicates the document contains information you need.
- The user explicitly asks you to read a specific document.

Do NOT use:
- Before calling list_knowledge_documents — you need a uuid first.
- Repeatedly for the same uuid in one turn — the content does not change between calls.

Parameters:
- documentUuid: The uuid of the document to read, taken from a previous list_knowledge_documents result.
`;

export const toolGetKnowledgeDocumentContentArgsSchema = createToolSchema()
    .extend({
        documentUuid: z
            .string()
            .uuid()
            .describe('Uuid of the document to read.'),
    })
    .build();

export const toolGetKnowledgeDocumentContentOutputSchema = z.object({
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

export type ToolGetKnowledgeDocumentContentArgs = z.infer<
    typeof toolGetKnowledgeDocumentContentArgsSchema
>;

export type ToolGetKnowledgeDocumentContentOutput = z.infer<
    typeof toolGetKnowledgeDocumentContentOutputSchema
>;
