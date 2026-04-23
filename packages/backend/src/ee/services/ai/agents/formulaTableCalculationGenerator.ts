import {
    assertUnreachable,
    Compact,
    GenerateFormulaTableCalculationRequest,
    NumberSeparator,
    TableCalculationFieldContext,
} from '@lightdash/common';
import { FUNCTION_CATALOG, parse } from '@lightdash/formula';
import { generateObject } from 'ai';
import { z } from 'zod';
import Logger from '../../../../logging/logger';
import { GeneratorModelOptions } from '../models/types';
import {
    CustomFormatSchema,
    sanitizeCustomFormat,
} from './tableCalculationGenerator';

const FormulaTableCalculationSchema = z.object({
    formula: z
        .string()
        .min(1, 'Formula expression must not be empty')
        .describe(
            'A spreadsheet-like formula expression using field IDs to reference fields (e.g., orders_total_revenue + orders_tax)',
        ),
    displayName: z
        .string()
        .min(1, 'Display name must not be empty')
        .max(100, 'Display name must be 100 characters or less')
        .describe('A human-readable name for the table calculation'),
    type: z
        .enum(['number', 'string', 'date', 'timestamp', 'boolean'])
        .describe(
            'The result type of the calculation: number for numeric calculations, string for text, date/timestamp for date operations, boolean for true/false',
        ),
    format: CustomFormatSchema.nullable().describe(
        'Display formatting options for the calculated value',
    ),
});

export type GeneratedFormulaTableCalculation = z.infer<
    typeof FormulaTableCalculationSchema
>;

export type FormulaTableCalculationContext =
    GenerateFormulaTableCalculationRequest;

function getFieldId(f: TableCalculationFieldContext): string {
    return `${f.table}_${f.name}`;
}

function buildFieldReferenceGuide(
    fieldsContext: TableCalculationFieldContext[],
): string {
    if (fieldsContext.length === 0) return 'No fields available.';

    const dimensions = fieldsContext.filter((f) => f.fieldType === 'dimension');
    const metrics = fieldsContext.filter((f) => f.fieldType === 'metric');
    const tableCalcs = fieldsContext.filter(
        (f) => f.fieldType === 'table_calculation',
    );

    const sections: string[] = [];

    if (dimensions.length > 0) {
        sections.push('DIMENSIONS (grouping fields):');
        sections.push(
            dimensions
                .map(
                    (f) =>
                        `  ${getFieldId(f)} - "${f.label}" (${f.type})${f.description ? ` - ${f.description}` : ''}`,
                )
                .join('\n'),
        );
    }

    if (metrics.length > 0) {
        sections.push('\nMETRICS (aggregated values):');
        sections.push(
            metrics
                .map(
                    (f) =>
                        `  ${getFieldId(f)} - "${f.label}" (${f.type})${f.description ? ` - ${f.description}` : ''}`,
                )
                .join('\n'),
        );
    }

    if (tableCalcs.length > 0) {
        sections.push('\nEXISTING TABLE CALCULATIONS:');
        sections.push(
            tableCalcs
                .map(
                    (f) =>
                        `  ${getFieldId(f)} - "${f.label}"${f.description ? ` - ${f.description}` : ''}`,
                )
                .join('\n'),
        );
    }

    return sections.join('\n');
}

function buildSystemPrompt(): string {
    return `You are a spreadsheet formula expert helping users create table calculations for a data visualization tool.

Table calculations use spreadsheet-like formulas that operate on the results of a query (after aggregation).

SYNTAX RULES:
- Reference fields using their field ID directly (e.g., orders_total_revenue)
- Do NOT use any prefix like @ or $ for field references
- Do NOT include a leading = sign in the formula
- Formulas support standard operators: + - * / % ^ (power)
- Comparison operators: = < > <= >= <>
- Boolean operators: AND, OR, NOT
- String literals use double quotes: "text"
- Parentheses for grouping: (a + b) * c

AVAILABLE FUNCTIONS:

${FUNCTION_CATALOG}

COMMON FORMULA PATTERNS:

1. CONDITIONAL:
IF(orders_total_revenue > 1000, "high", "low")

2. PERCENT OF TOTAL:
orders_total_revenue / SUM(orders_total_revenue)
Note: Use format type "percent" for this calculation.

3. RUNNING TOTAL:
RUNNING_TOTAL(orders_total_revenue)

4. PERCENT CHANGE FROM PREVIOUS:
(orders_total_revenue - LAG(orders_total_revenue)) / LAG(orders_total_revenue)
Note: Use format type "percent" for this calculation.

5. MOVING AVERAGE:
MOVING_AVG(orders_total_revenue, 3)

6. RANK:
RANK()

7. NULL HANDLING:
COALESCE(orders_discount, 0)

DISPLAY NAME:
- Create a concise, descriptive name that explains what the calculation does

FORMAT (display formatting):
Choose the appropriate format.type and only include the allowed options for that type:

- "default": No additional options needed
- "percent": Options: round, separator
- "currency": Options: currency (required), round, separator, compact
- "number": Options: round, separator, compact, prefix, suffix
- "bytes_si": Options: round, separator, compact
- "bytes_iec": Options: round, separator, compact
- "custom": Only the custom field (format string from customformats.com)

Available enum values:
- separator: ${Object.values(NumberSeparator).join(', ')}
- compact (for number/currency): ${[
        Compact.THOUSANDS,
        Compact.MILLIONS,
        Compact.BILLIONS,
        Compact.TRILLIONS,
    ].join(', ')}
- compact (for bytes_si): ${[
        Compact.KILOBYTES,
        Compact.MEGABYTES,
        Compact.GIGABYTES,
        Compact.TERABYTES,
        Compact.PETABYTES,
    ].join(', ')}
- compact (for bytes_iec): ${[
        Compact.KIBIBYTES,
        Compact.MEBIBYTES,
        Compact.GIBIBYTES,
        Compact.TEBIBYTES,
        Compact.PEBIBYTES,
    ].join(', ')}

IMPORTANT format rules:
- prefix/suffix are ONLY available for "number" type
- currency is ONLY for "currency" type
- compact values depend on format type

RESULT TYPE:
- Choose the appropriate result type based on what the calculation returns:
- "number" for numeric results (percentages, counts, sums, averages, etc.)
- "string" for text results (concatenations, case statements returning text)
- "date" for date-only results
- "timestamp" for datetime results
- "boolean" for true/false results

TYPE CONSISTENCY:
- All branches of an IF expression MUST return the same type
- If mixing text and numbers, convert numbers to text using CONCAT(field, "")
- Example: IF(x > 0, "positive", CONCAT(x, "")) — NOT IF(x > 0, "positive", x)

IMPORTANT:
- Only use fields that are provided in the available fields list
- Use the exact field IDs shown
- Do NOT include a leading = sign`;
}

function validateFormula(formula: string): string | null {
    try {
        parse(`=${formula}`);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

function buildExistingNamesBlock(existing: string[]): string {
    return existing.length > 0
        ? `Note: These table calculation names are already taken: ${existing.join(', ')}`
        : '';
}

function buildPromptModeContent(
    context: Extract<FormulaTableCalculationContext, { mode: 'prompt' }>,
    fieldReferenceGuide: string,
): string {
    return `Create a formula table calculation based on this request: "${context.prompt}"

Data source: "${context.tableName}"

Available fields to reference:
${fieldReferenceGuide}

${
    context.currentFormula
        ? `Current formula (user wants to improve/modify this):\n${context.currentFormula}\n`
        : ''
}${buildExistingNamesBlock(context.existingTableCalculations)}`;
}

function buildConvertSqlModeContent(
    context: Extract<FormulaTableCalculationContext, { mode: 'convert-sql' }>,
    fieldReferenceGuide: string,
): string {
    return `Convert the following SQL expression into an equivalent formula expression. Use only the formula syntax described in the system prompt. Only use the available fields listed below — rewrite any column references to the provided field IDs.

Source SQL:
${context.sourceSql}

Data source: "${context.tableName}"

Available fields to reference:
${fieldReferenceGuide}

${buildExistingNamesBlock(context.existingTableCalculations)}`;
}

export function buildUserContent(
    context: FormulaTableCalculationContext,
    fieldReferenceGuide: string,
): string {
    switch (context.mode) {
        case 'prompt':
            return buildPromptModeContent(context, fieldReferenceGuide);
        case 'convert-sql':
            return buildConvertSqlModeContent(context, fieldReferenceGuide);
        default:
            return assertUnreachable(
                context,
                'Unknown formula generation mode',
            );
    }
}

export async function generateFormulaTableCalculation(
    modelOptions: GeneratorModelOptions,
    context: FormulaTableCalculationContext,
): Promise<GeneratedFormulaTableCalculation> {
    const fieldReferenceGuide = buildFieldReferenceGuide(context.fieldsContext);
    const systemPrompt = buildSystemPrompt();

    const userContent = buildUserContent(context, fieldReferenceGuide);

    const callLLM = async (
        extraMessages: Array<{
            role: 'user' | 'assistant';
            content: string;
        }> = [],
    ) => {
        const result = await generateObject({
            model: modelOptions.model,
            ...modelOptions.callOptions,
            providerOptions: modelOptions.providerOptions,
            schema: FormulaTableCalculationSchema,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
                ...extraMessages,
            ],
        });
        return result.object;
    };

    let result = await callLLM();

    // Strip leading = if the LLM included it
    result.formula = result.formula.replace(/^=/, '');

    const parseError = validateFormula(result.formula);
    if (parseError) {
        Logger.debug(
            `AI-generated formula failed validation: ${parseError}. Retrying...`,
        );

        result = await callLLM([
            {
                role: 'assistant',
                content: JSON.stringify(result),
            },
            {
                role: 'user',
                content: `The formula you generated is invalid. Parser error: "${parseError}". Please fix the formula and try again. Remember: do NOT include a leading = sign, use field IDs directly without any prefix.`,
            },
        ]);

        result.formula = result.formula.replace(/^=/, '');

        const retryError = validateFormula(result.formula);
        if (retryError) {
            Logger.warn(
                `AI-generated formula failed validation after retry: ${retryError}`,
            );
            throw new Error(
                'Failed to generate a valid formula. Please try rephrasing your request.',
            );
        }
    }

    return result;
}

export { sanitizeCustomFormat };
