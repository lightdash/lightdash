import { z } from 'zod';

export const TOOL_PROPOSE_WRITEBACK_DESCRIPTION = [
    'Open or update a pull request that modifies the dbt project / Lightdash semantic layer for this project.',
    'Use this tool ONLY when the user asks to CHANGE something in the underlying repo — e.g. add or rename a metric, edit a dimension definition, modify a dbt model, update YAML metadata.',
    'Do NOT use this tool for read-only questions, querying data, exploring fields, or for changes that can be made inside Lightdash (use editContent / proposeChange for those).',
    'The writeback agent runs in an isolated sandbox, edits the repo, runs `lightdash compile`, and opens a pull request. The call is synchronous and can take several minutes.',
    'If the user pastes a link to an existing pull request and asks to iterate on it, pass that link as prUrl so the change updates that PR instead of opening a duplicate.',
].join(' ');

export const toolProposeWritebackArgsSchema = z.object({
    prompt: z
        .string()
        .min(1)
        .describe(
            'A focused, self-contained natural-language instruction for the writeback agent describing exactly which files in the dbt project to change and how. The writeback agent does not see this conversation, so include every detail it needs (model name, file path hints, the literal change to make). Do not include preamble or pleasantries.',
        ),
    prUrl: z
        .string()
        .nullable()
        .describe(
            "If the user pasted a link to an existing GitHub pull request they want to UPDATE instead of opening a new one, put the full PR URL here (e.g. 'https://github.com/owner/repo/pull/123'). The PR must belong to this project's own dbt repository. Only set this when the user explicitly references an existing PR to edit; otherwise pass null to open a new pull request.",
        ),
});

export const toolProposeWritebackOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            prUrl: z.string().nullable(),
        }),
        z.object({
            status: z.literal('error'),
        }),
    ]),
});

export type ToolProposeWritebackArgs = z.infer<
    typeof toolProposeWritebackArgsSchema
>;

export type ToolProposeWritebackOutput = z.infer<
    typeof toolProposeWritebackOutputSchema
>;

type ToolProposeWritebackResultLike = {
    toolType: string;
    toolName: string;
    metadata:
        | ToolProposeWritebackOutput['metadata']
        | Record<string, unknown>
        | null;
};

type ToolProposeWritebackResult = ToolProposeWritebackResultLike & {
    toolType: 'built-in';
    toolName: 'proposeWriteback';
    metadata: ToolProposeWritebackOutput['metadata'];
};

export const isToolProposeWritebackResult = <
    T extends ToolProposeWritebackResultLike,
>(
    result: T,
): result is T & ToolProposeWritebackResult =>
    result.toolType === 'built-in' &&
    result.toolName === 'proposeWriteback' &&
    toolProposeWritebackOutputSchema.shape.metadata.safeParse(result.metadata)
        .success;
