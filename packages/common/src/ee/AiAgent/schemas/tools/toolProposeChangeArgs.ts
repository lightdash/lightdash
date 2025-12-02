import { z } from 'zod';
import { type Dimension, type Metric, type Table } from '../../../..';
import { customMetricBaseSchema } from '../customMetrics';
import { getFieldIdSchema } from '../fieldId';
import { createToolSchema } from '../toolSchemaBuilder';

// ============================================================================
// Tool Description
// ============================================================================

export const TOOL_PROPOSE_CHANGE_DESCRIPTION = `
Creates a change proposal for tables, metrics, and dimensions. Changes are applied immediately but can be reviewed and rejected afterward.

**Supported Operations:**
- Update table descriptions and labels
- Update metric/dimension descriptions and labels
- Create new metrics

**Technical Requirements:**
- When updating descriptions or labels, must preserve as much original content as possible
- Descriptions should maintain their original format (preserve complete value and formatting)
- Must provide entity table name, rationale, and change details
- Changes are tracked with proposer information and timestamp
- For updates: use "replace" operation with complete updated value (not partial)
- For adding new properties: use "add" operation (creates property if it does not exist)
- For new metrics: use "create" operation with full metric definition
`;

// ============================================================================
// Type Helpers
// ============================================================================

type ChangePatch<T> = Partial<Record<keyof T, z.ZodType>>;

const getPatchDescription = (type: 'metric' | 'dimension' | 'table') =>
    `Patch to apply to the ${type}. You can omit/set-to-null any fields you don't want to change.`;

// ============================================================================
// Operation Schemas
// ============================================================================

/**
 * Op schema can be configured on per-field basis to have a appropriate type and allow applicable operations
 */
const getOpSchema = <T extends z.ZodTypeAny>(type: T) =>
    z.discriminatedUnion('op', [
        z
            .object({ op: z.literal('replace'), value: type })
            .describe(
                [
                    'Replace (overwrite) the value of the field.',
                    'Updates the **entire** value of the field to reflect the necessary changes, replacing the current value entirely.',
                    'Even if only the part is being changed, make sure to pass the entire value with changes included so that no part is lost.',
                ].join('\n'),
            ),
        z
            .object({ op: z.literal('add'), value: type })
            .describe(
                'Add a new value to the field. (Creates a new property if it does not exist)',
            ),
        // z.object({
        //   op: z.literal("push"),
        //   value: z.any(),
        //   index: z.number().nullable() // add later to support `"path": "/tags/-"` / "path": "/tags/0" if no index, default to ops on array
        // }),
        // z.object({ op: z.literal("remove") }),
    ]);

const stringOpSchema = getOpSchema(z.string());

// ============================================================================
// Entity Change Schemas
// ============================================================================

const TableChangeSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('update'),
        patch: z
            .object({
                description: stringOpSchema.nullable(),
                label: stringOpSchema.nullable(),
            } satisfies ChangePatch<Table>)
            .describe(getPatchDescription('table')),
    }),
]);

const DimensionChangeSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('update'),
        patch: z
            .object({
                label: stringOpSchema.nullable(),
                description: stringOpSchema.nullable(),
            } satisfies ChangePatch<Dimension>)
            .describe(getPatchDescription('dimension')),
    }),
    // z.object({
    //   type: z.literal('delete'),
    // })
]);

const MetricChangeSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('create'),
        value: z.discriminatedUnion('entityType', [
            z
                .object({
                    entityType: z.literal('metric'),
                    metric: customMetricBaseSchema,
                })
                .describe('Create a new metric'),
        ]),
    }),
    z.object({
        type: z.literal('update'),
        patch: z
            .object({
                label: stringOpSchema.nullable(),
                description: stringOpSchema.nullable(),
                // aiHint: OpSchema,
            } satisfies ChangePatch<Metric>)
            .describe(getPatchDescription('metric')),
    }),
]);

// ============================================================================
// Main Change Schema
// ============================================================================

const changeSchema = z.discriminatedUnion('entityType', [
    z.object({
        entityType: z.literal('table'),
        value: TableChangeSchema,
    }),
    z.object({
        entityType: z.literal('dimension'),
        fieldId: getFieldIdSchema({ additionalDescription: '' }),
        value: DimensionChangeSchema,
    }),
    z.object({
        entityType: z.literal('metric'),
        fieldId: getFieldIdSchema({
            additionalDescription:
                'if you are creating a new metric, this is the field id of the new metric not the dimension id',
        }),
        value: MetricChangeSchema,
    }),
]);

// ============================================================================
// Tool Schema Export
// ============================================================================

export const toolProposeChangeArgsSchema = createToolSchema({
    description: TOOL_PROPOSE_CHANGE_DESCRIPTION,
})
    .extend({
        entityTableName: z
            .string()
            .describe('The name of the table/explore being modified'),
        rationale: z
            .string()
            .describe(
                'Brief explanation of why this change is being proposed and what it improves',
            ),
        change: changeSchema,
    })
    .build();

export type ToolProposeChangeArgs = z.infer<typeof toolProposeChangeArgsSchema>;
export type ToolProposeChangeReplaceStringOp = z.infer<typeof stringOpSchema>;
export type UpdateDimensionPatch = ChangePatch<Dimension>;
export type UpdateMetricPatch = ChangePatch<Metric>;
export type UpdateTablePatch = ChangePatch<Table>;

export const toolProposeChangeOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            changeUuid: z.string(),
            userFeedback: z
                .enum(['accepted', 'rejected'])
                .default('accepted')
                .optional(),
        }),
        z.object({
            status: z.literal('error'),
        }),
    ]),
});

export type ToolProposeChangeOutput = z.infer<
    typeof toolProposeChangeOutputSchema
>;
