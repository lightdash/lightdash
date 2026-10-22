import { z } from 'zod';
import { aiProjectContextTypedObjectRefSchema } from '../../projectContext';
import { toolErrorStructuredContentSchema } from '../outputMetadata';

export const TOOL_EDIT_PROJECT_CONTEXT_DESCRIPTION = [
    "Open or update a pull request that adds or changes one entry in this project's context (`lightdash.project_context.yml`), the business definitions and routing facts agents read before answering.",
    'Use it for a durable, project-specific fact that would prevent a class of wrong answers: a definition or acronym ("HR" = the high-risk cohort, not human resources), which explore or join answers a kind of question, or a note about one object. It does not change dbt or semantic-layer YAML.',
    'The YAML is changed directly, without a sandbox, and the call returns once the pull request is open; report it as your own work.',
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
        .array(aiProjectContextTypedObjectRefSchema)
        .describe(
            'The semantic objects this fact concerns. Use {type:"explore",name} for explores and {type:"field",explore,fieldId} for fields; [] when purely prompt-driven.',
        ),
});

export const toolEditProjectContextStructuredContentSchema = z.object({
    prAction: z
        .enum(['opened', 'updated'])
        .describe(
            'Whether a new pull request was opened or the existing one was updated.',
        ),
    op: z
        .enum(['create', 'update'])
        .describe(
            'Whether the pull request adds a new project-context entry or updates an existing one.',
        ),
    content: z
        .string()
        .describe('The entry sentence written to the project context.'),
});

const toolEditProjectContextOutputMetadataSchema = z.discriminatedUnion(
    'status',
    [
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
    ],
);

// Same envelope as `structuredToolOutputSchema`, composed by hand because the
// metadata is a discriminated union rather than a plain object.
export const toolEditProjectContextOutputSchema = z.object({
    result: z.string(),
    metadata: toolEditProjectContextOutputMetadataSchema,
    structuredContent: z.union([
        toolEditProjectContextStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolEditProjectContextArgs = z.infer<
    typeof toolEditProjectContextArgsSchema
>;

export type ToolEditProjectContextStructuredContent = z.infer<
    typeof toolEditProjectContextStructuredContentSchema
>;

export type ToolEditProjectContextOutput = z.infer<
    typeof toolEditProjectContextOutputSchema
>;
