import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';

const SEMANTIC_LAYER_FRAGMENT_GUIDE = [
    "Each entry of `models` names one model and gives a YAML fragment of what to add or patch on it. A model that does not exist yet needs `sql_from` (its table, or a single SELECT for a derived model) and `dimensions`. A dimension needs `name`, `type` (string, number, date, timestamp or boolean) and `sql`, written as ${TABLE}.column. A metric that aggregates one column goes in `metrics` under that dimension, with a `type` (count, count_distinct, sum, average, min, max, median) and optional `filters`, a list of single `field: value` pairs. A metric over an expression goes in top-level `metrics` with its own `sql` in this warehouse's SQL dialect; one that combines other metrics uses `type: number` and ${metric_name}. A derived dimension goes in `additional_dimensions` under its dimension. A join goes in `joins` with `join` (the other model) and `sql_on`, written as ${model.field} = ${other_model.field}.",
    // Placeholders, not names: a concrete example gets copied into models it has nothing to do with.
    'Shape of a fragment for a new model, where each <placeholder> comes from the warehouse:\nsql_from: <schema>.<table>\ndimensions:\n  - name: <column>\n    type: number\n    sql: ${TABLE}.<column>\n    metrics:\n      <metric_name>:\n        type: sum\n        filters:\n          - <other_column>: <value>\n  - name: <other_column>\n    type: string\n    sql: ${TABLE}.<other_column>\n',
];

export const TOOL_PROPOSE_SEMANTIC_LAYER_CHANGE_DESCRIPTION = [
    "Add a change to the person's draft of this project's semantic layer. It builds on what is already in the draft, every check runs against the warehouse, and nothing goes live until they apply the draft.",
    ...SEMANTIC_LAYER_FRAGMENT_GUIDE,
    'Because a person reviews the draft, a fragment may also redefine an existing field: give only the keys that change, and null removes a key. `remove` lists paths to delete, written dimensions.<name>, dimensions.<name>.metrics.<name>, dimensions.<name>.additional_dimensions.<name>, metrics.<name> or joins.<name>; `removeModel` deletes the whole model. A field can be hidden with `hidden: true`. Showing a hidden field again, and who can see a model or field (tags, required_attributes, any_attributes, sql_filter), cannot be changed and comes back under `refusals`.',
    'A `ready` model passed its checks and joined the draft, and a `note` on it says what was only estimated and needs the person to confirm; `unchanged` means the entry changes nothing; `failed` carries the error to fix before proposing again, and that entry stays out of the draft.',
].join(' ');

export const toolProposeSemanticLayerChangeArgsSchema = z.object({
    models: z
        .array(
            z.object({
                name: z
                    .string()
                    .describe(
                        'The model to change, or the snake_case name of a new model.',
                    ),
                yaml: z
                    .string()
                    .nullable()
                    .describe(
                        'YAML mapping of what to add or change on this model, without `name` or `type`; null when the entry only removes.',
                    ),
                remove: z
                    .array(z.string())
                    .describe('Paths on this model to delete; empty for none.'),
                removeModel: z
                    .boolean()
                    .describe('True only to delete this whole model.'),
            }),
        )
        .min(1)
        .describe(
            'One entry per model. Models that join each other can change in the same call.',
        ),
    changeName: z
        .string()
        .nullable()
        .describe(
            'A short name for the change, describing the request. Used only when this edit starts a new change.',
        ),
    note: z
        .string()
        .nullable()
        .describe(
            'The one thing about this change most worth checking, under 15 words, shown on its card; null when nothing is.',
        ),
    options: z
        .array(z.string().trim().min(1))
        .max(2)
        .describe(
            'At most two things the person might ask for next instead, each written as they would say it in under 8 words. Each shows as a button that sends it. Empty for none.',
        ),
});

export type ToolProposeSemanticLayerChangeArgs = z.infer<
    typeof toolProposeSemanticLayerChangeArgsSchema
>;

export const TOOL_READ_SEMANTIC_MODEL_DESCRIPTION =
    "Read one model's YAML as the person's draft leaves it, which is what a proposal builds on. An unknown name returns the name of every model.";

const proposalMetadataSchema = z.object({
    status: z.literal('success'),
    models: z.array(
        z.object({
            model: z.string(),
            status: z.enum(['ready', 'unchanged', 'failed']),
            changes: z.array(
                z.object({
                    path: z.string(),
                    action: z.enum([
                        'created',
                        'added',
                        'patched',
                        'redefined',
                        'removed',
                    ]),
                }),
            ),
            refusals: z.array(
                z.object({
                    path: z.string(),
                    reason: z.enum([
                        'access',
                        'name_taken',
                        'incomplete',
                        'invalid_filter',
                        'not_found',
                    ]),
                }),
            ),
            error: z.string().nullable(),
            // Absent on results stored before notes existed.
            notes: z.array(z.string()).optional(),
        }),
    ),
    diffs: z.array(
        z.object({
            model: z.string(),
            contentBefore: z.string().nullable(),
            contentAfter: z.string().nullable(),
        }),
    ),
    // Null when nothing in this proposal passed, so nothing joined the draft.
    draftChangeUuid: z.string().nullable(),
    // Absent on results stored before an edit could start a change.
    startedChange: z
        .object({ workspaceUuid: z.string(), name: z.string() })
        .nullable()
        .default(null),
    // Absent on results stored before a change carried a note and offers.
    note: z.string().nullable().default(null),
    options: z.array(z.string()).default([]),
    // True when the result came back with advice to act on, a metric to run, or parts refused, before the turn ends.
    needsFollowUp: z.boolean().default(false),
});

const proposalStructuredContentSchema = proposalMetadataSchema.pick({
    models: true,
});

export const toolProposeSemanticLayerChangeOutputSchema =
    structuredToolOutputSchema({
        metadata: z.union([
            proposalMetadataSchema,
            z.object({ status: z.literal('error') }),
        ]),
        structuredContent: proposalStructuredContentSchema,
    });

export type ToolProposeSemanticLayerChangeOutput = z.infer<
    typeof toolProposeSemanticLayerChangeOutputSchema
>;

export type SemanticLayerProposal = z.infer<typeof proposalMetadataSchema>;

/** The line kept as the reply when a turn ends on its card with nothing written, so history and copy still read. */
export const describeSemanticLayerProposals = (
    proposals: Pick<SemanticLayerProposal, 'models'>[],
): string => {
    const ready = proposals.flatMap(({ models }) =>
        models.filter(({ status }) => status === 'ready'),
    );
    if (ready.length === 0) return 'Nothing changed in the draft.';
    const names = [...new Set(ready.map(({ model }) => model))];
    const leftOut = ready.some(({ refusals }) => refusals.length > 0)
        ? ' Some parts were left out.'
        : '';
    return `Changed ${names.join(', ')} in the draft.${leftOut}`;
};

export const isToolProposeSemanticLayerChangeResult =
    makeBuiltInToolResultGuard(
        'proposeSemanticLayerChange',
        proposalMetadataSchema,
    );

export const toolReadSemanticModelArgsSchema = z.object({
    name: z.string().describe('The model to read.'),
});

export type ToolReadSemanticModelArgs = z.infer<
    typeof toolReadSemanticModelArgsSchema
>;

export const toolReadSemanticModelOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: z.object({
        content: z.string().nullable(),
        inDraft: z.boolean(),
        modelNames: z.array(z.string()),
    }),
});

export type ToolReadSemanticModelOutput = z.infer<
    typeof toolReadSemanticModelOutputSchema
>;

const studioChangeSummarySchema = z.object({
    name: z.string(),
    isCheckedOut: z.boolean(),
    models: z.array(
        z.object({
            name: z.string(),
            // Who made the model's edits: the person in the editor, this chat, or another chat.
            editedIn: z.array(z.enum(['by_hand', 'this_chat', 'another_chat'])),
        }),
    ),
});
export type StudioChangeSummary = z.infer<typeof studioChangeSummarySchema>;
export const toolListChangesArgsSchema = z.object({});
export const toolListChangesOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: z.object({
        changes: z.array(studioChangeSummarySchema),
    }),
});
