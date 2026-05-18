import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FRONTEND_ACTION_DESCRIPTION = `Ask the Lightdash web app to perform a frontend action`;

export const toolFrontendActionArgsSchema = createToolSchema({
    description: TOOL_FRONTEND_ACTION_DESCRIPTION,
})
    .extend({
        action: z
            .string()
            .min(1)
            .describe(
                'Stable frontend handler id. Example: "navigateToChart" or "readSelectedFilters".',
            ),
        payload: z
            .record(z.string(), z.unknown())
            .nullable()
            .describe(
                'Structured arguments for the frontend handler. Use null when no extra arguments are needed.',
            ),
    })
    .build();

export type ToolFrontendActionArgs = z.infer<
    typeof toolFrontendActionArgsSchema
>;

export const toolFrontendActionOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFrontendActionOutput = z.infer<
    typeof toolFrontendActionOutputSchema
>;
