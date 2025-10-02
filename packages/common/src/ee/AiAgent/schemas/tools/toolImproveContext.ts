import { z } from 'zod';
import { AiResultType } from '../../types';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_IMPROVE_CONTEXT_DESCRIPTION = `

  - **When to use the Improve Context Tool:**
    - User guides table/explore selection: "You can use the main_table for summary queries - you don't need the detailed table"
    - User shares business methodology: "Generally we use higher-level categories to have fewer groupings"
    - User clarifies where to find data: "Use the dimension table to get category details"
    - User corrects field usage: "Filter by order_number not order_id"
    - User corrects terminology: "Actually, 'total revenue' means revenue_after_tax"
    - User provides better formatting/structure: "I'd structure the examples like this: Category: X, Feedback: Y"
    - User clarifies business rules: "Customer count should exclude test accounts"
    - Your confidence this is a learnable correction (not just a new request) is above 0.7

 - **Learning Categories and Examples:**

    Category: explore_selection
    Feedback: "Use the sales_data explore instead of the orders table for revenue analysis"
    Generated instruction: "For revenue analysis queries, use the sales_data explore instead of the orders table"

    Category: field_selection
    Feedback1: "No, use net_revenue instead of gross_revenue"
    Generated instruction1: "When users ask for revenue, use the net_revenue field instead of gross_revenue"
    Feedback2: "Actually, 'total revenue' should always refer to the revenue_after_tax field"
    Generated instruction2: "When users mention 'total revenue', they mean the revenue_after_tax field"

    Category: filter_logic
    Feedback: "The customer_count should exclude test accounts"
    Generated instruction: "When calculating customer_count, always exclude test accounts using the filter is_test_account = false"

    Category: other
    Feedback1: "Always show results in descending order by default"
    Generated instruction1: "When showing metric results, default to descending order unless explicitly requested otherwise"
    Feedback2: "We prefer to analyze by region rather than individual store locations"
    Generated instruction2: "When analyzing geographic data, use region-level aggregations instead of individual store locations"

 `;

export const toolImproveContextArgsSchema = createToolSchema(
    AiResultType.IMPROVE_CONTEXT,
    TOOL_IMPROVE_CONTEXT_DESCRIPTION,
)
    .extend({
        originalQuery: z
            .string()
            .describe('The original user query that led to incorrect results'),
        incorrectResponse: z
            .string()
            .describe('What the AI incorrectly suggested or returned'),
        correctResponse: z
            .string()
            .describe('What the user corrected or clarified'),
        category: z
            .enum([
                'explore_selection',
                'field_selection',
                'filter_logic',
                'calculation',
                'other',
            ])
            .describe('Category of the learning'),
        confidence: z
            .number()
            .min(0)
            .max(1)
            .describe(
                'Confidence score that this is a learnable learning or more context is needed',
            ),
        suggestedInstruction: z
            .string()
            .describe('The instruction to append to agent settings'),
    })
    .build();

export type ToolImproveContextArgs = z.infer<
    typeof toolImproveContextArgsSchema
>;

export const toolImproveContextOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolImproveContextOutput = z.infer<
    typeof toolImproveContextOutputSchema
>;
