import { z } from 'zod';
import { isValidDashboardTilePositions } from '../../../../utils/dashboardTilePositions';
import { AI_DASHBOARD_LAYOUT_TEMPLATES } from '../../dashboardLayout';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    chartConfigBuiltinOnlySchema,
    rejectAgentMergeConfig,
    toolRunQueryArgsSchemaPersisted,
    toolRunQueryArgsSchemaTransformed,
    toolRunQueryArgsSchemaV2FormulaOnly,
} from './toolRunQueryArgs';

export const TOOL_DASHBOARD_V2_DESCRIPTION = `Generate a dashboard of visualizations on one theme in a single call.

Design a summary dashboard for monitoring a topic at a glance (e.g. Support, Revenue Performance, Sales Operations), ordering the kinds of visualization that fit the data like this:
1. KPI tables with the overall summary metrics.
2. Line or area charts for how metrics trend over time.
3. Bar or horizontal bar charts comparing metrics across categories.
4. Pie charts for part-to-whole relationships (e.g. revenue by segment).
5. Scatter plots for relationships between two metrics.
6. Funnel charts for sequential conversion (e.g. a sales funnel).
7. Detail tables with the line items that move the metrics most.`;

// Dashboard visualization schema - use generateVisualization format for each
// visualization. Custom chart types are thread-only for the PoC, so each
// dashboard visualization pins the builtin-only chart config.
const dashboardV2VisualizationSchema = z.preprocess(
    rejectAgentMergeConfig,
    toolRunQueryArgsSchemaV2FormulaOnly.extend({
        chartConfig: chartConfigBuiltinOnlySchema,
    }),
);

// Persisted artifacts may carry legacy template table calcs the advertised
// (formula-only) viz schema no longer accepts; type as the wide persisted shape.
export type DashboardV2Visualization = z.infer<
    typeof toolRunQueryArgsSchemaPersisted
>;

const dashboardV2Fields = {
    title: z.string().describe('A descriptive title for the dashboard'),
    description: z
        .string()
        .describe('A descriptive summary or explanation for the dashboard.'),
} as const;

const visualizationsDescription =
    "Visualizations in generateVisualization's format, each serving the dashboard's theme.";

// Advertised agent contract: formula-only table calcs per visualization.
export const toolDashboardV2ArgsSchema = createToolSchema()
    .extend({
        ...dashboardV2Fields,
        visualizations: z
            .array(dashboardV2VisualizationSchema)
            .min(2)
            .max(15)
            .describe(visualizationsDescription),
    })
    .build();

// Wide variant for parsing persisted artifacts and incoming tool calls; it
// accepts everything the advertised schema produces plus legacy template
// table calcs. Tracks toolRunQueryArgsSchemaPersisted (see its invariant).
export const toolDashboardV2ArgsSchemaPersisted = createToolSchema()
    .extend({
        ...dashboardV2Fields,
        // A partially validated dashboard may retain one usable visualization.
        visualizations: z
            .array(toolRunQueryArgsSchemaPersisted)
            .min(1)
            .max(15)
            .describe(visualizationsDescription),
        // Server-owned presentation metadata; never advertised as tool input.
        layout: z
            .object({
                template: z.enum(AI_DASHBOARD_LAYOUT_TEMPLATES),
                positions: z
                    .array(
                        z.object({
                            x: z.number().int().nonnegative(),
                            y: z.number().int().nonnegative(),
                            w: z.number().int().positive(),
                            h: z.number().int().positive(),
                        }),
                    )
                    .min(1)
                    .max(15),
            })
            .optional(),
    })
    .build()
    .superRefine((value, ctx) => {
        if (
            value.layout &&
            !isValidDashboardTilePositions(
                value.layout.positions,
                value.visualizations.length,
            )
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['layout'],
                message:
                    'Dashboard layout must place every visualization within the grid without overlap.',
            });
        }
    });

export type ToolDashboardV2Args = z.infer<
    typeof toolDashboardV2ArgsSchemaPersisted
>;

export const toolDashboardV2ArgsSchemaTransformed =
    toolDashboardV2ArgsSchemaPersisted.transform((data) => ({
        ...data,
        visualizations: data.visualizations.map((viz) =>
            toolRunQueryArgsSchemaTransformed.parse(viz),
        ),
    }));

export type ToolDashboardV2ArgsTransformed = z.infer<
    typeof toolDashboardV2ArgsSchemaTransformed
>;

export const toolDashboardV2StructuredContentSchema = z.object({
    visualizationCount: z
        .number()
        .nullable()
        .describe(
            'How many visualizations the dashboard was created with; null when the result text does not state the count.',
        ),
    excludedVisualizations: z
        .array(
            z.object({
                title: z.string().describe('Title of the visualization.'),
                error: z
                    .string()
                    .describe('Why the visualization failed validation.'),
            }),
        )
        .describe(
            'Visualizations left out of the dashboard because they failed validation; empty when every visualization was included.',
        ),
    layout: z
        .object({
            template: z.enum(AI_DASHBOARD_LAYOUT_TEMPLATES),
            positions: z.array(
                z.object({
                    x: z.number().int(),
                    y: z.number().int(),
                    w: z.number().int(),
                    h: z.number().int(),
                }),
            ),
        })
        .nullable(),
    defaultLayoutNote: z.string().nullable(),
});

export type ToolDashboardV2StructuredContent = z.infer<
    typeof toolDashboardV2StructuredContentSchema
>;

export const toolDashboardV2OutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolDashboardV2StructuredContentSchema,
});

export type ToolDashboardV2Output = z.infer<typeof toolDashboardV2OutputSchema>;
