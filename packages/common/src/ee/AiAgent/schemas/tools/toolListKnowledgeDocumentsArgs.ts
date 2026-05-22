import { z } from 'zod';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const getToolListKnowledgeDocumentsDescription = ({
    name,
    findExploresName,
    findFieldsName,
    getKnowledgeDocumentContentName,
    listWarehouseTablesName,
    runQueryName,
    runSqlName,
}: {
    name: string;
    findExploresName: string;
    findFieldsName: string;
    getKnowledgeDocumentContentName: string;
    listWarehouseTablesName: string;
    runQueryName: string;
    runSqlName: string;
}) => `Tool: ${name}

Purpose:
List the knowledge documents that have been curated for this AI agent by the organization. These are short, user-written reference notes (business rules, glossaries, definitions, policies, runbooks, domain background) intended to extend the agent's understanding of the project beyond what the semantic layer and warehouse schema describe.

Each item in the result includes a short summary describing what the document is about. Use that summary to decide whether the full content is worth reading with ${getKnowledgeDocumentContentName}.

When to use:
- At the start of a task, to discover what curated knowledge exists that might be relevant.
- When the user references a concept that might be defined in business documentation (e.g. "what counts as an active user", "how do we classify a refund").
- When you need background or policy context that the data warehouse alone cannot provide.

Do NOT use:
- For data queries — use ${runQueryName} / ${runSqlName} / ${findFieldsName} instead.
- For schema or table discovery — use ${findExploresName} / ${listWarehouseTablesName} instead.

Parameters:
- (no parameters)
`;

const toolListKnowledgeDocumentsOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export const listKnowledgeDocumentsTool = defineTool({
    canonicalName: 'listKnowledgeDocuments',
    title: 'List Knowledge Documents',
    contexts: ['agent'] as const,
    description: {
        agent: ({ name }) =>
            getToolListKnowledgeDocumentsDescription({
                findExploresName: 'findExplores',
                findFieldsName: 'findFields',
                getKnowledgeDocumentContentName: 'getKnowledgeDocumentContent',
                listWarehouseTablesName: 'listWarehouseTables',
                name,
                runQueryName: 'runQuery',
                runSqlName: 'runSql',
            }),
    },
    buildInputSchemas: {
        agent: ({ createSchema }) => createSchema().build(),
    },
    outputSchema: toolListKnowledgeDocumentsOutputSchema,
});

export type ToolListKnowledgeDocumentsArgs = ToolInput<
    typeof listKnowledgeDocumentsTool,
    'agent'
>;
export type ToolListKnowledgeDocumentsOutput = ToolOutput<
    typeof listKnowledgeDocumentsTool
>;
