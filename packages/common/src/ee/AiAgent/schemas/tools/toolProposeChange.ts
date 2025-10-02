import { z } from 'zod';
import { type Dimension, type Metric, type Table } from '../../../..';
import { AiResultType } from '../../types';
import { customMetricBaseSchema } from '../customMetrics';
import { getFieldIdSchema } from '../fieldId';
import { createToolSchema } from '../toolSchemaBuilder';

// ============================================================================
// Tool Description
// ============================================================================

export const TOOL_PROPOSE_CHANGE_DESCRIPTION = `
Use this tool to propose changes to a table's metadata in the semantic layer. This tool creates a change proposal that can be reviewed and approved before being applied.

- When updating descriptions, ensure to preserve as much original content as possible. Remember that descriptions are enclosed in "description" tags and you should take the whole value into account as well as its format.
- If modifying tables, _always_ use the findExplores tool to check existing descriptions before proposing changes to ensure no important content is removed.
- If modifying metrics or dimensions, _always_ use the findFields tool to check existing descriptions before proposing changes to ensure no important content is removed.
- If creating a new metric, _always_ use the findFields tool to check existing metrics before proposing changes to ensure no content is duplicated.

- **When to use the Propose Change Tool:**
  - User requests to update a table description: "Update the description of the customers table"
  - User wants to improve a dimension description: "Add a better description for the customer_name field"
  - User asks to clarify a metric description: "Update the total_revenue metric description to explain it's net revenue"
  - User wants to document business logic in descriptions: "Add a note that active_users excludes test accounts"

- **What this tool does:**
  - Creates a change proposal in the system
  - The change is NOT applied immediately - it requires review and approval
  - Supports updating descriptions for tables, dimensions, and metrics
  - Supports creating new metrics
  - Tracks who proposed the change and when
  - Change proposals can be reviewed, approved, or rejected by authorized users

- **Examples:**

  User: "Update the customers table description to mention it includes both B2B and B2C customers"
  User: "The revenue_net field should explain it's after taxes and discounts"
  User: "Create a new metric called 'Median Order Amount' that calculates the median order amount"
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

export const toolProposeChangeArgsSchema = createToolSchema(
    AiResultType.PROPOSE_CHANGE,
    TOOL_PROPOSE_CHANGE_DESCRIPTION,
)
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
