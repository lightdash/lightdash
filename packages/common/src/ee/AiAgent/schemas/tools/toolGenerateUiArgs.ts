import { z } from 'zod';
import { toolErrorStructuredContentSchema } from '../outputMetadata';

export const GENERATIVE_UI_LIMITS = {
    maxDepth: 4,
    maxBlocks: 40,
    maxQueries: 6,
    maxSteps: 10,
    maxColumns: 8,
    maxOptions: 100,
    maxStaticRows: 100,
    maxStaticRowKeys: 8,
    maxArrayItems: 50,
    maxStringLength: 500,
} as const;

const textSchema = z.string().min(1).max(GENERATIVE_UI_LIMITS.maxStringLength);
const stringValueSchema = z.string().max(GENERATIVE_UI_LIMITS.maxStringLength);
const identifierSchema = z.string().regex(/^[A-Za-z]\w{0,63}$/);
const pathSchema = z.string().max(200);
const operationIdSchema = z
    .string()
    .min(1)
    .max(100)
    .describe('An operationId returned by searchApi.');
const primitiveSchema = z.union([
    stringValueSchema,
    z.number(),
    z.boolean(),
    z.null(),
]);

// The tool description documents references; describing them here would let
// the JSON Schema converter hoist one branch's text onto every value union.
export const generativeUiStateRefSchema = z.strictObject({
    $state: identifierSchema,
});

export const generativeUiQueryRefSchema = z.strictObject({
    $query: identifierSchema,
    path: pathSchema.optional(),
});

export const generativeUiResultRefSchema = z.strictObject({
    $result: identifierSchema,
    path: pathSchema.optional(),
});

export const generativeUiItemRefSchema = z.strictObject({ $item: pathSchema });

export type GenerativeUiRef =
    | z.infer<typeof generativeUiStateRefSchema>
    | z.infer<typeof generativeUiQueryRefSchema>
    | z.infer<typeof generativeUiResultRefSchema>
    | z.infer<typeof generativeUiItemRefSchema>;

export type GenerativeUiRefTarget =
    | { kind: 'state'; key: string }
    | { kind: 'query'; queryId: string; path: string }
    | { kind: 'result'; stepId: string; path: string }
    | { kind: 'item'; path: string };

/** Reads a reference written in spec syntax, or returns null for any other value. */
export const parseGenerativeUiRef = (
    value: unknown,
): GenerativeUiRefTarget | null => {
    const state = generativeUiStateRefSchema.safeParse(value);
    if (state.success) return { kind: 'state', key: state.data.$state };
    const query = generativeUiQueryRefSchema.safeParse(value);
    if (query.success) {
        return {
            kind: 'query',
            queryId: query.data.$query,
            path: query.data.path ?? '',
        };
    }
    const result = generativeUiResultRefSchema.safeParse(value);
    if (result.success) {
        return {
            kind: 'result',
            stepId: result.data.$result,
            path: result.data.path ?? '',
        };
    }
    const item = generativeUiItemRefSchema.safeParse(value);
    if (item.success) return { kind: 'item', path: item.data.$item };
    return null;
};

export type GenerativeUiValue =
    | string
    | number
    | boolean
    | null
    | GenerativeUiRef
    | GenerativeUiValue[]
    | { [key: string]: GenerativeUiValue };

const valueLeafSchema = z.union([
    stringValueSchema,
    z.number(),
    z.boolean(),
    z.null(),
    generativeUiStateRefSchema,
    generativeUiQueryRefSchema,
    generativeUiResultRefSchema,
    generativeUiItemRefSchema,
]);

const nestedValueSchemaOf = <T extends z.ZodType>(inner: T) =>
    z.union([
        valueLeafSchema,
        z.array(inner).max(GENERATIVE_UI_LIMITS.maxArrayItems),
        z.record(z.string(), inner),
    ]);

// Recursive zod schemas cannot be serialised for agent tools (cycles throw),
// so request bodies nest at most six levels.
const bodyValueSchema = nestedValueSchemaOf(
    nestedValueSchemaOf(
        nestedValueSchemaOf(
            nestedValueSchemaOf(nestedValueSchemaOf(valueLeafSchema)),
        ),
    ),
);

const paramsSchema = z.strictObject({
    path: z
        .record(z.string(), valueLeafSchema)
        .optional()
        .describe('Path parameters by name. Never set projectUuid.'),
    query: z
        .record(
            z.string(),
            z.union([
                valueLeafSchema,
                z
                    .array(valueLeafSchema)
                    .max(GENERATIVE_UI_LIMITS.maxArrayItems),
            ]),
        )
        .optional()
        .describe('Query-string parameters by name.'),
    body: bodyValueSchema.optional().describe('JSON request body.'),
});

const visibleWhenSchema = z
    .strictObject({ $state: identifierSchema, equals: primitiveSchema })
    .describe(
        'Show the block only while the input with this key equals the value.',
    )
    .optional();

const requiredSchema = z.boolean().optional();

const staticOptionSchema = z.strictObject({
    label: textSchema,
    value: stringValueSchema,
});

const optionsSchema = z
    .union([
        z.array(staticOptionSchema).min(1).max(GENERATIVE_UI_LIMITS.maxOptions),
        z.strictObject({
            $query: identifierSchema,
            path: pathSchema
                .optional()
                .describe(
                    'Dotted path to the array inside `results`; omit when `results` is the array.',
                ),
            label: pathSchema.describe("Dotted path to each item's label."),
            value: pathSchema.describe("Dotted path to each item's value."),
        }),
    ])
    .describe(
        "Literal options, or options read from a declared query's results.",
    );

const headingBlockSchema = z
    .strictObject({
        type: z.literal('heading'),
        text: textSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe('Section heading.');

const textBlockSchema = z
    .strictObject({
        type: z.literal('text'),
        text: textSchema,
        variant: z.enum(['body', 'dimmed']).optional(),
        visibleWhen: visibleWhenSchema,
    })
    .describe('Paragraph of plain text.');

const calloutBlockSchema = z
    .strictObject({
        type: z.literal('callout'),
        variant: z.enum(['info', 'warning', 'danger']),
        text: textSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe('Highlighted note.');

const dividerBlockSchema = z
    .strictObject({
        type: z.literal('divider'),
        visibleWhen: visibleWhenSchema,
    })
    .describe('Horizontal rule.');

const textInputBlockSchema = z
    .strictObject({
        type: z.literal('textInput'),
        key: identifierSchema,
        label: textSchema,
        placeholder: textSchema.optional(),
        initial: stringValueSchema.optional(),
        required: requiredSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe('Single-line text; the value is a string.');

const textareaBlockSchema = z
    .strictObject({
        type: z.literal('textarea'),
        key: identifierSchema,
        label: textSchema,
        placeholder: textSchema.optional(),
        initial: stringValueSchema.optional(),
        required: requiredSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe('Multi-line text; the value is a string.');

const numberInputBlockSchema = z
    .strictObject({
        type: z.literal('numberInput'),
        key: identifierSchema,
        label: textSchema,
        initial: z.number().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        required: requiredSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe('Number; the value is a number, or null when empty.');

const checkboxBlockSchema = z
    .strictObject({
        type: z.literal('checkbox'),
        key: identifierSchema,
        label: textSchema,
        initial: z.boolean().optional(),
        visibleWhen: visibleWhenSchema,
    })
    .describe('Checkbox; the value is a boolean.');

const dateInputBlockSchema = z
    .strictObject({
        type: z.literal('dateInput'),
        key: identifierSchema,
        label: textSchema,
        initial: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        required: requiredSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe('Date picker; the value is "YYYY-MM-DD", or null when empty.');

const selectBlockSchema = z
    .strictObject({
        type: z.literal('select'),
        key: identifierSchema,
        label: textSchema,
        options: optionsSchema,
        initial: stringValueSchema.optional(),
        required: requiredSchema,
        searchable: z.boolean().optional(),
        visibleWhen: visibleWhenSchema,
    })
    .describe('Dropdown; the value is the chosen option value, or null.');

const multiSelectBlockSchema = z
    .strictObject({
        type: z.literal('multiSelect'),
        key: identifierSchema,
        label: textSchema,
        options: optionsSchema,
        initial: z
            .array(stringValueSchema)
            .max(GENERATIVE_UI_LIMITS.maxOptions)
            .optional(),
        required: requiredSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe('Multi-choice dropdown; the value is an array of option values.');

const segmentedBlockSchema = z
    .strictObject({
        type: z.literal('segmented'),
        key: identifierSchema,
        label: textSchema,
        options: z.array(staticOptionSchema).min(2).max(6),
        initial: stringValueSchema,
        visibleWhen: visibleWhenSchema,
    })
    .describe(
        'Segmented control with 2-6 options; the value is the chosen option value.',
    );

const tableBlockSchema = z
    .strictObject({
        type: z.literal('table'),
        rows: z
            .union([
                generativeUiQueryRefSchema,
                z
                    .array(z.record(z.string(), primitiveSchema))
                    .max(GENERATIVE_UI_LIMITS.maxStaticRows),
            ])
            .describe(
                'A query reference to an array of row objects, or literal rows (at most 8 keys each).',
            ),
        columns: z
            .array(
                z.strictObject({
                    key: pathSchema.describe(
                        'Dotted path to the cell value in each row.',
                    ),
                    label: textSchema,
                }),
            )
            .min(1)
            .max(GENERATIVE_UI_LIMITS.maxColumns),
        selectable: z
            .strictObject({
                key: identifierSchema,
                rowKey: pathSchema.describe(
                    'Dotted path to the id stored for each selected row.',
                ),
                multiple: z.boolean(),
                required: z
                    .boolean()
                    .optional()
                    .describe('Require at least one selected row.'),
            })
            .optional()
            .describe(
                'Row selection; the value is an array of row ids when multiple, else a row id or null.',
            ),
        visibleWhen: visibleWhenSchema,
    })
    .describe('Read-only table, optionally with row selection.');

const leafBlockSchemas = [
    headingBlockSchema,
    textBlockSchema,
    calloutBlockSchema,
    dividerBlockSchema,
    textInputBlockSchema,
    textareaBlockSchema,
    numberInputBlockSchema,
    checkboxBlockSchema,
    dateInputBlockSchema,
    selectBlockSchema,
    multiSelectBlockSchema,
    segmentedBlockSchema,
    tableBlockSchema,
] as const;

const leafBlockSchema = z.discriminatedUnion('type', leafBlockSchemas);

const gapSchema = z.enum(['xs', 'sm', 'md']);

const stackBlockSchemaOf = <T extends z.ZodType>(child: T) =>
    z
        .strictObject({
            type: z.literal('stack'),
            gap: gapSchema.optional(),
            children: z.array(child).min(1).max(GENERATIVE_UI_LIMITS.maxBlocks),
        })
        .describe('Vertical layout.');

const groupBlockSchemaOf = <T extends z.ZodType>(child: T) =>
    z
        .strictObject({
            type: z.literal('group'),
            grow: z
                .boolean()
                .optional()
                .describe('Stretch the children to share the row.'),
            children: z.array(child).min(1).max(GENERATIVE_UI_LIMITS.maxBlocks),
        })
        .describe('Horizontal layout; children wrap on narrow screens.');

const blockLevelSchemaOf = <T extends z.ZodType>(child: T) =>
    z.discriminatedUnion('type', [
        leafBlockSchema,
        stackBlockSchemaOf(child),
        groupBlockSchemaOf(child),
    ]);

// Nesting is spelled out level by level (see bodyValueSchema), which also caps
// the depth at GENERATIVE_UI_LIMITS.maxDepth.
const blockLevel3Schema = blockLevelSchemaOf(leafBlockSchema);
const blockLevel2Schema = blockLevelSchemaOf(blockLevel3Schema);
const topStackBlockSchema = stackBlockSchemaOf(blockLevel2Schema);
const topGroupBlockSchema = groupBlockSchemaOf(blockLevel2Schema);
const blockSchema = z.discriminatedUnion('type', [
    leafBlockSchema,
    topStackBlockSchema,
    topGroupBlockSchema,
]);

export type GenerativeUiLeafBlock = z.infer<typeof leafBlockSchema>;

export type GenerativeUiBlock =
    | GenerativeUiLeafBlock
    | {
          type: 'stack';
          gap?: z.infer<typeof gapSchema>;
          children: GenerativeUiBlock[];
      }
    | { type: 'group'; grow?: boolean; children: GenerativeUiBlock[] };

const querySchema = z
    .strictObject({
        operationId: operationIdSchema,
        params: paramsSchema.optional(),
    })
    .describe(
        'A GET operation whose `results` feed options and tables. Its params may reference $state only; it re-runs when those inputs change.',
    );

const stepSchema = z
    .strictObject({
        id: identifierSchema.describe(
            'Unique step id; later steps read the response with {"$result": id}.',
        ),
        operationId: operationIdSchema,
        params: paramsSchema.optional(),
        forEach: z
            .union([
                generativeUiStateRefSchema,
                generativeUiQueryRefSchema,
                generativeUiResultRefSchema,
            ])
            .optional()
            .describe(
                'Run the step once per element of this array; {"$item": path} reads the element.',
            ),
    })
    .describe('One non-GET request, run as the user.');

const actionSchema = z
    .strictObject({
        label: textSchema.describe('Button text.'),
        confirm: textSchema
            .optional()
            .describe(
                'Question asked on the first click. Required when any step uses DELETE.',
            ),
        steps: z
            .array(stepSchema)
            .min(1)
            .max(GENERATIVE_UI_LIMITS.maxSteps)
            .describe('Run in order; the chain stops at the first failure.'),
        successMessage: textSchema.optional(),
    })
    .describe('The single button at the bottom of the card.');

export const toolGenerateUiArgsSchema = z.strictObject({
    version: z.literal(1),
    title: textSchema,
    description: textSchema.optional(),
    queries: z
        .record(identifierSchema, querySchema)
        .optional()
        .describe(
            `Read-only queries by id (at most ${GENERATIVE_UI_LIMITS.maxQueries}).`,
        ),
    blocks: z
        .array(blockSchema)
        .min(1)
        .max(GENERATIVE_UI_LIMITS.maxBlocks)
        .describe(
            `Card body, top to bottom (at most ${GENERATIVE_UI_LIMITS.maxBlocks} blocks in total, nested at most ${GENERATIVE_UI_LIMITS.maxDepth} deep).`,
        ),
    action: actionSchema,
});

export type GenerativeUiSpec = z.infer<typeof toolGenerateUiArgsSchema>;
export type GenerativeUiParams = z.infer<typeof paramsSchema>;
export type GenerativeUiQuery = z.infer<typeof querySchema>;
export type GenerativeUiStep = z.infer<typeof stepSchema>;
export type GenerativeUiAction = z.infer<typeof actionSchema>;
export type GenerativeUiOptions = z.infer<typeof optionsSchema>;

const blockSchemasByType = {
    stack: topStackBlockSchema,
    group: topGroupBlockSchema,
    heading: headingBlockSchema,
    text: textBlockSchema,
    callout: calloutBlockSchema,
    divider: dividerBlockSchema,
    textInput: textInputBlockSchema,
    textarea: textareaBlockSchema,
    numberInput: numberInputBlockSchema,
    checkbox: checkboxBlockSchema,
    dateInput: dateInputBlockSchema,
    select: selectBlockSchema,
    multiSelect: multiSelectBlockSchema,
    segmented: segmentedBlockSchema,
    table: tableBlockSchema,
} satisfies Record<GenerativeUiBlock['type'], z.ZodType>;

const blockVocabulary = Object.entries(blockSchemasByType).map(
    ([type, schema]) => {
        const fields = Object.entries<z.ZodType>(schema.shape)
            .filter(([name]) => name !== 'type' && name !== 'visibleWhen')
            .map(([name, field]) =>
                field.safeParse(undefined).success ? `${name}?` : name,
            );
        return `- ${type}(${fields.join(', ')}): ${schema.description ?? ''}`;
    },
);

export const TOOL_GENERATE_UI_DESCRIPTION = [
    'Render an interactive card in the chat: inputs the user fills in, and one button that runs a short chain of Lightdash API requests as the user. Use it when you need input (pick a space, choose charts, set a schedule) or a confirmation before a change.',
    '',
    'Workflow: find operations with searchApi, read their parameters with describeApi, then call this tool once with the whole card. The run pauses while the card is open. The result is the outcome: success (every response), failed (the failing step and its error; earlier steps already ran) or dismissed.',
    '',
    'Values: any parameter value is a literal or a reference:',
    '- {"$state": key}: an input value, or the selected row ids of a table.',
    '- {"$query": id, "path"?: "a.b"}: a declared query\'s `results`.',
    '- {"$result": stepId, "path"?: "a.b"}: an earlier step\'s `results`; a forEach step\'s result is an array with one entry per element.',
    '- {"$item": "a.b"}: the current forEach element ("" for the element itself).',
    'There are no expressions. To send one request per selected item, use forEach.',
    '',
    'Rules:',
    '- Use only operationIds from searchApi. Queries are GET operations; steps are not.',
    '- Query params may only reference $state. Never set projectUuid; it is filled in.',
    '- $result names an earlier step. $item appears only in forEach steps, and every forEach step uses it.',
    '- A forEach over an empty selection runs no requests; set required on the input when a choice is needed.',
    '- Keys and step ids are unique. Set action.confirm when any step uses DELETE.',
    `- Limits: ${GENERATIVE_UI_LIMITS.maxBlocks} blocks, depth ${GENERATIVE_UI_LIMITS.maxDepth}, ${GENERATIVE_UI_LIMITS.maxQueries} queries, ${GENERATIVE_UI_LIMITS.maxSteps} steps, ${GENERATIVE_UI_LIMITS.maxColumns} table columns, ${GENERATIVE_UI_LIMITS.maxStringLength} characters per string. Text renders as plain text.`,
    '- Bind options and rows to queries instead of pasting long lists.',
    '',
    'Blocks (every block except stack and group accepts visibleWhen):',
    ...blockVocabulary,
].join('\n');

export const generativeUiHttpMethodSchema = z.enum([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
]);

export type GenerativeUiHttpMethod = z.infer<
    typeof generativeUiHttpMethodSchema
>;

export const generativeUiStateSchema = z.record(
    z.string(),
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(z.union([z.string(), z.number()])),
    ]),
);

export type GenerativeUiState = z.infer<typeof generativeUiStateSchema>;

const requestErrorSchema = z.object({
    statusCode: z.number().int(),
    name: z.string(),
    message: z.string(),
});

const stepResponsesSchema = z
    .record(z.string(), z.array(z.json()))
    .describe(
        'Response `results` by step id, one entry per request; a forEach step has one per element.',
    );

/** What the browser reports after the user acts on the card. */
export const generativeUiActionSubmissionSchema = z.discriminatedUnion(
    'status',
    [
        z.object({
            status: z.literal('success'),
            state: generativeUiStateSchema,
            responses: stepResponsesSchema,
        }),
        z.object({
            status: z.literal('failed'),
            state: generativeUiStateSchema,
            responses: stepResponsesSchema,
            failure: z.object({
                stepId: z.string(),
                itemIndex: z.number().int().min(0).nullable(),
                error: requestErrorSchema,
            }),
        }),
        z.object({
            status: z.literal('dismissed'),
            state: generativeUiStateSchema,
        }),
    ],
);

export type GenerativeUiActionSubmission = z.infer<
    typeof generativeUiActionSubmissionSchema
>;

const stepRequestSchema = z.object({
    operationId: z.string(),
    method: generativeUiHttpMethodSchema,
    pathTemplate: z.string(),
});

const stepResultSchema = z.object({
    request: stepRequestSchema,
    responses: z
        .array(z.json())
        .describe(
            'Response `results`, one per request; a forEach step has one per element.',
        ),
    truncated: z
        .boolean()
        .describe('True when long arrays or strings were cut short.'),
});

const successOutcomeSchema = z.object({
    status: z.literal('success'),
    state: generativeUiStateSchema,
    steps: z.record(z.string(), stepResultSchema),
});

const failedOutcomeSchema = z.object({
    status: z.literal('failed'),
    state: generativeUiStateSchema,
    completed: z.record(z.string(), stepResultSchema),
    failedStep: z.object({
        id: z.string(),
        itemIndex: z.number().int().min(0).nullable(),
        request: stepRequestSchema,
        error: requestErrorSchema,
    }),
});

const dismissedOutcomeSchema = z.object({
    status: z.literal('dismissed'),
    state: generativeUiStateSchema,
});

/** The outcome the agent reads; requests come from the spec, never the browser. */
export const generativeUiActionOutcomeSchema = z.discriminatedUnion('status', [
    successOutcomeSchema,
    failedOutcomeSchema,
    dismissedOutcomeSchema,
]);

export type GenerativeUiActionOutcome = z.infer<
    typeof generativeUiActionOutcomeSchema
>;

const errorMetadataSchema = z.object({ status: z.literal('error') });
const successMetadataSchema = successOutcomeSchema.pick({
    status: true,
    state: true,
});
const failedMetadataSchema = failedOutcomeSchema.pick({
    status: true,
    state: true,
});
const dismissedMetadataSchema = dismissedOutcomeSchema.pick({
    status: true,
    state: true,
});

export const toolGenerateUiMetadataSchema = z.discriminatedUnion('status', [
    errorMetadataSchema,
    successMetadataSchema,
    failedMetadataSchema,
    dismissedMetadataSchema,
]);

export type ToolGenerateUiMetadata = z.infer<
    typeof toolGenerateUiMetadataSchema
>;

// Same envelope as structuredToolOutputSchema, paired per status so metadata
// and structuredContent cannot disagree.
export const toolGenerateUiOutputSchema = z.union([
    z.object({
        result: z.string(),
        metadata: errorMetadataSchema,
        structuredContent: toolErrorStructuredContentSchema,
    }),
    z.object({
        result: z.string(),
        metadata: successMetadataSchema,
        structuredContent: successOutcomeSchema,
    }),
    z.object({
        result: z.string(),
        metadata: failedMetadataSchema,
        structuredContent: failedOutcomeSchema,
    }),
    z.object({
        result: z.string(),
        metadata: dismissedMetadataSchema,
        structuredContent: dismissedOutcomeSchema,
    }),
]);

export type ToolGenerateUiOutput = z.infer<typeof toolGenerateUiOutputSchema>;
