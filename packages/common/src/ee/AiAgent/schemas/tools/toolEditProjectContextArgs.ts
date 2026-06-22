import { z } from 'zod';

export const TOOL_EDIT_PROJECT_CONTEXT_DESCRIPTION = [
    "Open or update a pull request that changes this project's Lightdash project context — the lightdash.project_context.yml living document of business definitions and routing/context facts the AI agents read before answering.",
    'Use this ONLY to add or refine a durable, project-specific fact: a business definition or acronym ("HR" = high-risk cohort, not human resources), routing/join guidance about which explore answers a question, or an object-scoped context note — something that would prevent a class of wrong answers in future turns.',
    'Do NOT use this for dbt / semantic-layer YAML changes (use editDbtProject for those) or for read-only questions.',
    'The change is applied deterministically via a GitHub-API merge of the YAML — there is no sandbox — and a pull request is opened or updated. The call is synchronous. Treat the result as your own work when you report it to the user.',
].join(' ');

// Mirrors AiAgentJudgeProjectContextEntry — the structured entry the
// deterministic ProjectContextService.writebackEntry applies to the YAML.
export const toolEditProjectContextArgsSchema = z.object({
    op: z
        .enum(['create', 'update'])
        .describe(
            'Use "update" to replace an existing project-context entry (set id), otherwise "create".',
        ),
    id: z
        .string()
        .nullable()
        .describe(
            'The id of the existing entry to replace when op="update"; otherwise null.',
        ),
    kind: z
        .enum(['definition', 'context'])
        .describe(
            'Use "definition" for acronyms and business vocabulary ("X means Y"); use "context" for routing/join rules, guidance, or durable object-scoped facts.',
        ),
    content: z
        .string()
        .describe(
            'A single self-contained sentence stating the fact (e.g. \'"HR" = the high-risk diabetes cohort, not human resources.\').',
        ),
    terms: z
        .array(z.string())
        .describe(
            'The prompt-facing trigger words/phrases that should surface this entry (e.g. ["HR","high risk"]). Required for definitions.',
        ),
    objects: z
        .array(z.string())
        .describe(
            'The semantic objects this fact concerns — explore names and/or field ids in the table_field form (e.g. "payments_total_amount"); [] when purely prompt-driven.',
        ),
});

export const toolEditProjectContextOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            prUrl: z.string().nullable(),
            // Nullish, not required: tool-call metadata is persisted, so cards
            // rendered from rows written before this field existed must parse.
            prAction: z.enum(['opened', 'updated']).nullish(),
        }),
        z.object({
            status: z.literal('error'),
            errorCode: z
                .enum([
                    'github_not_installed',
                    'unsupported_source_control',
                    'git_write_permission',
                    'unknown',
                ])
                .nullish(),
        }),
    ]),
});

export type ToolEditProjectContextArgs = z.infer<
    typeof toolEditProjectContextArgsSchema
>;

export type ToolEditProjectContextOutput = z.infer<
    typeof toolEditProjectContextOutputSchema
>;
