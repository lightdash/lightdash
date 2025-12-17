import {
    Compact,
    CompactOrAlias,
    currencies,
    CustomFormat,
    CustomFormatType,
    findCompactConfig,
    GenerateTableCalculationRequest,
    getCompactOptionsForFormatType,
    NumberSeparator,
    TableCalculationFieldContext,
} from '@lightdash/common';
import { generateObject, LanguageModel } from 'ai';
import { z } from 'zod';

const CustomFormatSchema = z.object({
    type: z
        .enum([
            CustomFormatType.DEFAULT,
            CustomFormatType.PERCENT,
            CustomFormatType.CURRENCY,
            CustomFormatType.NUMBER,
            CustomFormatType.BYTES_SI,
            CustomFormatType.BYTES_IEC,
            CustomFormatType.CUSTOM,
        ])
        .describe(
            `The display format type (available types: ${Object.values(
                CustomFormatType,
            ).join(', ')})`,
        ),
    round: z
        .number()
        .optional()
        .describe('Number of decimal places to round to'),
    separator: z
        .string()
        .optional()
        .describe(
            `Number separator style (available separators: ${Object.values(
                NumberSeparator,
            ).join(', ')})`,
        ),
    currency: z
        .string()
        .optional()
        .describe(
            `Currency code (available currencies: ${currencies.join(
                ', ',
            )}) when type is currency`,
        ),
    compact: z
        .string()
        .optional()
        .describe(
            `Compact notation (available compacts: ${Object.values(
                Compact,
            ).join(', ')})`,
        ),
    prefix: z.string().optional().describe('Text to prepend to the value'),
    suffix: z.string().optional().describe('Text to append to the value'),
    custom: z
        .string()
        .optional()
        .describe(
            'Custom format string when type is custom, following customformats.com syntax (e.g., "#,##0.00" for numbers, "0.00%" for percentages)',
        ),
});

/**
 * Sanitizes and validates AI-generated CustomFormat to ensure it follows the rules
 */
export function sanitizeCustomFormat(
    format: z.infer<typeof CustomFormatSchema> | undefined,
): CustomFormat | undefined {
    if (!format || !format.type) return undefined;

    const { type } = format;

    // Validate separator
    const validSeparator =
        format.separator &&
        Object.values(NumberSeparator).includes(
            format.separator as NumberSeparator,
        )
            ? (format.separator as NumberSeparator)
            : undefined;

    // Validate compact based on format type
    let validCompact: Compact | undefined;
    if (format.compact) {
        const compactConfig = findCompactConfig(
            format.compact as CompactOrAlias,
        );
        if (compactConfig) {
            const allowedCompacts = getCompactOptionsForFormatType(type);
            if (allowedCompacts.includes(compactConfig.compact)) {
                validCompact = compactConfig.compact;
            }
        }
    }

    // Validate currency
    const validCurrency =
        format.currency &&
        currencies.includes(format.currency as typeof currencies[number])
            ? (format.currency as typeof currencies[number])
            : undefined;

    switch (type) {
        case CustomFormatType.DEFAULT:
            return { type };

        case CustomFormatType.CUSTOM:
            return {
                type,
                custom: format.custom,
            };

        case CustomFormatType.PERCENT:
            return {
                type,
                round: format.round,
                separator: validSeparator,
            };

        case CustomFormatType.CURRENCY:
            return {
                type,
                currency: validCurrency,
                round: format.round,
                separator: validSeparator,
                compact: validCompact,
            };

        case CustomFormatType.NUMBER:
            return {
                type,
                round: format.round,
                separator: validSeparator,
                compact: validCompact,
                prefix: format.prefix,
                suffix: format.suffix,
            };

        case CustomFormatType.BYTES_SI:
        case CustomFormatType.BYTES_IEC:
            return {
                type,
                round: format.round,
                separator: validSeparator,
                compact: validCompact,
            };

        default:
            return { type: CustomFormatType.DEFAULT };
    }
}

const TableCalculationSchema = z.object({
    sql: z
        .string()
        .min(1, 'SQL expression must not be empty')
        .describe(
            'A SQL expression using ${table.field} syntax to reference fields',
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
    format: CustomFormatSchema.optional().describe(
        'Display formatting options for the calculated value',
    ),
});

export type GeneratedTableCalculation = z.infer<typeof TableCalculationSchema>;

export type TableCalculationContext = GenerateTableCalculationRequest & {
    warehouseType: string;
};

/**
 * Build a field reference for the ${table.field} syntax
 */
function getFieldReference(f: TableCalculationFieldContext): string {
    return `${f.table}.${f.name}`;
}

/**
 * Build a field reference guide for the prompt
 */
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
                        `  \${${getFieldReference(f)}} - "${f.label}" (${
                            f.type
                        })${f.description ? ` - ${f.description}` : ''}`,
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
                        `  \${${getFieldReference(f)}} - "${f.label}" (${
                            f.type
                        })${f.description ? ` - ${f.description}` : ''}`,
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
                        `  \${${getFieldReference(f)}} - "${f.label}"${
                            f.description ? ` - ${f.description}` : ''
                        }`,
                )
                .join('\n'),
        );
    }

    return sections.join('\n');
}

export async function generateTableCalculation(
    model: LanguageModel,
    context: TableCalculationContext,
): Promise<GeneratedTableCalculation> {
    const fieldReferenceGuide = buildFieldReferenceGuide(context.fieldsContext);

    const result = await generateObject({
        model,
        schema: TableCalculationSchema,
        messages: [
            {
                role: 'system',
                content: `You are a SQL expert helping users create table calculations for a data visualization tool.

                    Table calculations are SQL expressions that operate on the results of a query (after aggregation).
                    They allow row-by-row calculations on the result set.

                    SYNTAX RULES:
                    - Reference fields using \${table_name.field_name} syntax (e.g., \${orders.total_revenue})

                    COMMON PATTERNS:
                    - Percentage change from previous
                    - Percent of previous value
                    - Percent of column total
                    - Percent of group/pivot total
                    - Rank in column
                    - Running total
                    - Rolling window

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

                    IMPORTANT:
                    - Generate SQL that is valid for the specified warehouse type
                    - Only use fields that are provided in the available fields list
                    - Use the exact field names shown (with the \${} syntax)`,
            },
            {
                role: 'user',
                content: `Create a table calculation based on this request: "${
                    context.prompt
                }"

                    Warehouse: ${context.warehouseType}
                    Data source: "${context.tableName}"

                    Available fields to reference:
                    ${fieldReferenceGuide}

                    ${
                        context.currentSql
                            ? `Current SQL (user wants to improve/modify this):\n${context.currentSql}\n`
                            : ''
                    }${
                    context.existingTableCalculations?.length
                        ? `Note: These table calculation names are already taken: ${context.existingTableCalculations.join(
                              ', ',
                          )}`
                        : ''
                }`,
            },
        ],
        temperature: 0.3,
    });

    return result.object;
}
