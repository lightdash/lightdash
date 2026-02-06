import { GenerateTooltipRequest, TooltipFieldContext } from '@lightdash/common';
import { generateObject } from 'ai';
import { z } from 'zod';
import { GeneratorModelOptions } from '../models/types';

const TooltipSchema = z.object({
    html: z
        .string()
        .min(1, 'HTML must not be empty')
        .describe(
            'HTML content for the tooltip using ${field_name} syntax to reference data values',
        ),
});

export type GeneratedTooltip = z.infer<typeof TooltipSchema>;

export type TooltipContext = GenerateTooltipRequest;

/**
 * Build a field reference guide for the prompt
 */
function buildFieldReferenceGuide(
    fieldsContext: TooltipFieldContext[],
): string {
    if (fieldsContext.length === 0) return 'No fields available.';

    return fieldsContext
        .map((f) => `  \${${f.name}}${f.label ? ` - "${f.label}"` : ''}`)
        .join('\n');
}

export async function generateTooltip(
    modelOptions: GeneratorModelOptions,
    context: TooltipContext,
): Promise<GeneratedTooltip> {
    const fieldReferenceGuide = buildFieldReferenceGuide(context.fieldsContext);

    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        schema: TooltipSchema,
        messages: [
            {
                role: 'system',
                content: `You are an expert at creating HTML tooltips for data visualization charts.

Your task is to generate HTML content that will be displayed in chart tooltips to provide additional context about data points.

SYNTAX RULES:
- Reference field values using \${field_name} syntax (e.g., \${orders_total_amount})
- The tooltip content will be rendered as HTML, so you can use HTML tags for formatting

HTML GUIDELINES:
- Keep tooltips concise and readable
- Use semantic HTML elements appropriately
- Use inline styles sparingly for basic formatting (bold, colors, spacing)
- Structure content clearly with appropriate line breaks or spacing
- Numbers and values should be clearly labeled

COMMON PATTERNS:

1. SIMPLE LABEL-VALUE:
<b>Total Orders:</b> \${orders_total_amount}

2. MULTIPLE VALUES:
<b>Orders:</b> \${orders_count}<br/>
<b>Revenue:</b> \${total_revenue}

3. WITH CONTEXT:
<div style="margin-bottom: 4px;"><b>\${product_name}</b></div>
<div>Sales: \${sales_count}</div>
<div>Growth: \${growth_rate}</div>

4. COMPARISON:
<b>Current:</b> \${current_value}<br/>
<b>Previous:</b> \${previous_value}<br/>
<b>Change:</b> \${change_percent}

IMPORTANT:
- Only use field names that are provided in the available fields list
- Use the exact field names shown (with the \${} syntax)
- Keep HTML simple and avoid complex CSS
- Javascript is disabled in the tooltip
- Ensure the tooltip is readable and informative`,
            },
            {
                role: 'user',
                content: `Create tooltip HTML based on this request: "${
                    context.prompt
                }"

Available fields to reference:
${fieldReferenceGuide}

${
    context.currentHtml
        ? `Current HTML (user wants to improve/modify this):\n${context.currentHtml}\n`
        : ''
}`,
            },
        ],
    });

    return result.object;
}
