import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const TOOL_IMPROVE_CONTEXT_DESCRIPTION = `
Captures learnings from user corrections, clarifications, and guidance to improve future responses.

**Supported Learning Categories:**
- explore_selection: Which tables/explores to use for specific types of queries
- field_selection: Which fields to use for specific metrics or dimensions
- filter_logic: How to apply filters for calculations
- calculation: How to perform specific calculations or aggregations
- other: General preferences, formatting, or methodologies

**Technical Requirements:**
- Must provide original query context that led to the learning
- Must capture what was incorrect and what the correct approach is
- Must categorize the learning into one of the supported categories
- Must provide a confidence score (0-1) indicating if this is a learnable pattern
- Must generate a clear, actionable instruction to append to agent settings
- Instructions should be specific and context-aware (not overly generic)
`;

const toolImproveContextOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const toolImproveContextArgsSchema = z.object({
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
});

export const improveContextTool = defineTool({
    canonicalName: 'improveContext',
    title: 'Improve Context',
    contexts: ['agent'] as const,
    description: {
        agent: TOOL_IMPROVE_CONTEXT_DESCRIPTION,
    },
    buildInputSchemas: {
        agent: () => toolImproveContextArgsSchema,
    },
    outputSchema: toolImproveContextOutputSchema,
});

export type ToolImproveContextArgs = ToolInput<
    typeof improveContextTool,
    'agent'
>;
export type ToolImproveContextOutput = ToolOutput<typeof improveContextTool>;
