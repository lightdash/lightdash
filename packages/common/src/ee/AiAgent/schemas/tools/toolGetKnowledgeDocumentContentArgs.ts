import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { toolNameFor } from './discoveryToolNames';

export const TOOL_GET_KNOWLEDGE_DOCUMENT_CONTENT_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => {
    const listKnowledgeDocuments = toolNameFor(
        'listKnowledgeDocuments',
        runtime,
    );
    return `Tool: ${toolName}

Purpose:
Read the full text of one knowledge document or Deep Research report by its uuid, taken from "Available knowledge documents" in the system prompt or from a ${listKnowledgeDocuments} result. The content does not change within a turn, so read each uuid once.
`;
};

export const toolGetKnowledgeDocumentContentArgsSchema = createToolSchema()
    .extend({
        documentUuid: z
            .string()
            .uuid()
            .describe('Uuid of the document to read.'),
    })
    .build();

export const toolGetKnowledgeDocumentContentStructuredContentSchema = z.object({
    uuid: z.string().describe('Uuid of the knowledge document that was read.'),
    name: z.string().describe('Name of the knowledge document.'),
    mimeType: z
        .string()
        .describe('MIME type of the uploaded file the document came from.'),
    content: z.string().describe('Full text content of the document.'),
});

// Same envelope as `structuredToolOutputSchema`, composed inline because the
// helper only accepts object metadata and this tool's metadata is a union.
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
    structuredContent: z.union([
        toolGetKnowledgeDocumentContentStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolGetKnowledgeDocumentContentArgs = z.infer<
    typeof toolGetKnowledgeDocumentContentArgsSchema
>;

export type ToolGetKnowledgeDocumentContentStructuredContent = z.infer<
    typeof toolGetKnowledgeDocumentContentStructuredContentSchema
>;

export type ToolGetKnowledgeDocumentContentOutput = z.infer<
    typeof toolGetKnowledgeDocumentContentOutputSchema
>;
