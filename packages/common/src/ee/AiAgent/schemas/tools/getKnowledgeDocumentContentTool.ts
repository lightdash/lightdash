import { z } from 'zod';
import { defineTool } from '../defineTool';
import { createToolSchema } from '../toolSchemaBuilder';

const toolGetKnowledgeDocumentContentArgsSchema = createToolSchema()
    .extend({
        documentUuid: z
            .string()
            .uuid()
            .describe('Uuid of the document to read.'),
    })
    .build();

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
    name: 'getKnowledgeDocumentContent',
    title: 'Get Knowledge Document Content',
    description: (name) => `Tool: ${name}

Purpose:
Read the full text content of a single knowledge document by its uuid. Use this after listKnowledgeDocuments has surfaced a document whose summary looks relevant to the current task.

When to use:
- A summary from listKnowledgeDocuments indicates the document contains information you need.
- The user explicitly asks you to read a specific document.

Do NOT use:
- Before calling listKnowledgeDocuments — you need a uuid first.
- Repeatedly for the same uuid in one turn — the content does not change between calls.

Parameters:
- documentUuid: The uuid of the document to read, taken from a previous listKnowledgeDocuments result.
`,
    availability: 'agent',
    inputSchema: toolGetKnowledgeDocumentContentArgsSchema,
    agent: { outputSchema: toolGetKnowledgeDocumentContentOutputSchema },
});
