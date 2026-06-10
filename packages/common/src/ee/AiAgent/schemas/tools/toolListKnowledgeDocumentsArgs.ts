import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION = `Tool: list_knowledge_documents

Purpose:
List the knowledge documents that have been curated for this AI agent by the organization. These are short, user-written reference notes (business rules, glossaries, definitions, policies, runbooks, domain background) intended to extend the agent's understanding of the project beyond what the semantic layer and warehouse schema describe.

Each item in the result includes a short summary describing what the document is about. Use that summary to decide whether the full content is worth reading with get_knowledge_document_content.

When to use:
- At the start of a task, to discover what curated knowledge exists that might be relevant.
- When the user references a concept that might be defined in business documentation (e.g. "what counts as an active user", "how do we classify a refund").
- When you need background or policy context that the data warehouse alone cannot provide.

Do NOT use:
- For data queries — use generateVisualization / runSql / findFields instead.
- For schema or table discovery — use findExplores / listWarehouseTables instead.

Parameters:
- (no parameters)
`;

export const toolListKnowledgeDocumentsArgsSchema = createToolSchema().build();

export const toolListKnowledgeDocumentsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolListKnowledgeDocumentsArgs = z.infer<
    typeof toolListKnowledgeDocumentsArgsSchema
>;

export type ToolListKnowledgeDocumentsOutput = z.infer<
    typeof toolListKnowledgeDocumentsOutputSchema
>;
