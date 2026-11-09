import { generateText, Output } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const CustomVizSchema = z.object({
    spec: z
        .string()
        .min(1, 'Spec must not be empty')
        .describe(
            'The complete Vega-Lite specification as a JSON string, without the "data" property',
        ),
});

export type CustomVizContext = {
    prompt: string;
    fields: {
        id: string;
        name: string;
        type: string | undefined;
        fieldType: string | undefined;
    }[];
    sampleResults: { [k: string]: unknown }[];
    currentVizConfig: string;
};

/**
 * Generates a Vega-Lite spec for the custom chart editor. Returns it
 * pretty-printed, since it goes straight into the JSON editor.
 */
export async function generateCustomViz(
    modelOptions: GeneratorModelOptions,
    context: CustomVizContext,
): Promise<string> {
    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'generateCustomViz',
        'custom-viz',
    );
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        ...telemetry,
        output: Output.object({ schema: CustomVizSchema }),
        allowSystemInMessages: true,
        messages: [
            {
                role: 'system',
                content: `You are a helpful assistant that creates data visualizations using Vega-Lite.

The user will describe the chart they want to see, and you will also receive:
- A list of available fields with their types (e.g., "timestamp: DATE", "revenue: NUMBER").
- A small sample of the data.
- The current Vega-Lite configuration of the chart (if any).

Generate a complete and correct Vega-Lite specification that fulfills the user's request. Follow these guidelines:
1. If the user doesn't specify a chart type, choose the most appropriate one based on the field types and sample data.
2. Prioritize placing DATE or TIMESTAMP fields on the X-axis, and metrics (NUMBER fields) on the Y-axis.
3. Use color, tooltips, and encoding to make the chart visually appealing and informative.
4. Use the field IDs provided in available_fields to build the chart, even if the user names fields differently in the request.
5. Do not include the "data" property; it is added separately.
6. Unless the user asks for a new chart, build on the current Vega-Lite configuration.
7. The spec must be valid JSON, with double quotes for all keys and string values.`,
            },
            {
                role: 'user',
                content: `<user_request>
${context.prompt}
</user_request>

<available_fields>
${JSON.stringify(context.fields)}
</available_fields>

<sample_data>
${JSON.stringify(context.sampleResults)}
</sample_data>

<current_viz_config>
${context.currentVizConfig}
</current_viz_config>`,
            },
        ],
    });

    emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));

    try {
        return JSON.stringify(JSON.parse(result.output.spec), null, 2);
    } catch {
        // Hand back what the model wrote so the editor shows the JSON error.
        return result.output.spec;
    }
}
