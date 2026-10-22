import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { toolNameFor } from './discoveryToolNames';

export const TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => {
    const getKnowledgeDocumentContent = toolNameFor(
        'getKnowledgeDocumentContent',
        runtime,
    );
    return `Tool: ${toolName}

Purpose:
List the knowledge documents curated for this agent and the Deep Research reports from this conversation, each with a summary that tells you whether its full text is worth reading with ${getKnowledgeDocumentContent}.

When to use:
"Available knowledge documents" in the system prompt already lists the curated documents, so call this to find a Deep Research report from this conversation.
`;
};

export const toolListKnowledgeDocumentsArgsSchema = createToolSchema().build();

export const toolListKnowledgeDocumentsStructuredContentSchema = z.object({
    count: z
        .number()
        .int()
        .describe('Number of knowledge documents curated for this agent.'),
    documents: z.array(
        z.object({
            uuid: z
                .string()
                .describe(
                    'Pass to getKnowledgeDocumentContent to read the full document.',
                ),
            name: z.string(),
            sizeBytes: z
                .number()
                .int()
                .describe('Size of the full document content in bytes.'),
            relevance: z.enum(['high', 'medium', 'low', 'none']),
            description: z.string(),
            definedTerms: z.array(z.string()),
            relatedExploreNames: z.array(z.string()),
            useWhen: z.string(),
            warning: z.string().nullable(),
        }),
    ),
});

export const toolListKnowledgeDocumentsOutputSchema =
    structuredToolOutputSchema({
        metadata: baseOutputMetadataSchema,
        structuredContent: toolListKnowledgeDocumentsStructuredContentSchema,
    });

export type ToolListKnowledgeDocumentsArgs = z.infer<
    typeof toolListKnowledgeDocumentsArgsSchema
>;

export type ToolListKnowledgeDocumentsStructuredContent = z.infer<
    typeof toolListKnowledgeDocumentsStructuredContentSchema
>;

export type ToolListKnowledgeDocumentsOutput = z.infer<
    typeof toolListKnowledgeDocumentsOutputSchema
>;
