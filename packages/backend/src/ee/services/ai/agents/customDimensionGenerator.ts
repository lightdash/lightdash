import {
    DimensionType,
    type CustomDimensionFieldContext,
    type GenerateCustomDimensionRequest,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { type GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const CustomDimensionSchema = z.object({
    sql: z
        .string()
        .min(1, 'SQL expression must not be empty')
        .describe(
            'A SQL expression using ${table.field} syntax to reference dimensions',
        ),
    displayName: z
        .string()
        .min(1, 'Display name must not be empty')
        .max(100, 'Display name must be 100 characters or less'),
    dimensionType: z.nativeEnum(DimensionType),
});

export type GeneratedCustomDimension = z.infer<typeof CustomDimensionSchema>;

export type CustomDimensionContext = GenerateCustomDimensionRequest & {
    warehouseType: string;
};

export const buildCustomDimensionFieldReferenceGuide = (
    fields: CustomDimensionFieldContext[],
): string => {
    if (fields.length === 0) return 'No dimensions available.';

    return fields
        .map(
            (field) =>
                `  @${field.id} -> \${${field.table}.${field.name}} - "${
                    field.label
                }" (${field.type})${
                    field.description ? ` - ${field.description}` : ''
                }`,
        )
        .join('\n');
};

export const buildCustomDimensionMessages = (
    context: CustomDimensionContext,
) => [
    {
        role: 'system' as const,
        content: [
            'You create Lightdash custom SQL dimensions.',
            '',
            'CONTRACT',
            '- Write one row-level SQL expression that Lightdash can insert into a query.',
            '- Resolve each @field_id through the available reference mapping, then copy its ${table.field} token exactly.',
            '- Build the expression from available main-table or joined-table dimensions.',
            '- Use row-level scalar SQL and CASE expressions. Table calculations handle aggregate and window functions.',
            '- Follow the specified warehouse dialect.',
            '- Set dimensionType to the expression result: string, number, date, timestamp, or boolean.',
            '- Give the dimension a concise displayName.',
            '',
            'EXAMPLES',
            '',
            '1. Numeric buckets',
            'Available references: @numeric_dimension -> ${table.numeric_dimension} - "Numeric dimension" (number)',
            'Request: Group @numeric_dimension into small below 100, medium below 500, and large otherwise',
            'Output:',
            '{',
            "  \"sql\": \"CASE WHEN ${table.numeric_dimension} < 100 THEN 'small' WHEN ${table.numeric_dimension} < 500 THEN 'medium' ELSE 'large' END\",",
            '  "displayName": "Numeric bucket",',
            '  "dimensionType": "string"',
            '}',
            '',
            '2. Combine names',
            'Available references: @first_name -> ${table.first_name} - "First name" (string); @last_name -> ${table.last_name} - "Last name" (string)',
            'Request: Combine @first_name and @last_name into a full name',
            'Output:',
            '{',
            '  "sql": "CONCAT(${table.first_name}, \' \', ${table.last_name})",',
            '  "displayName": "Full name",',
            '  "dimensionType": "string"',
            '}',
            '',
            '3. Boolean dimension',
            'Available references: @status -> ${table.status} - "Status" (string)',
            'Request: Return true when @status is completed or shipped',
            'Output:',
            '{',
            '  "sql": "${table.status} IN (\'completed\', \'shipped\')",',
            '  "displayName": "Is fulfilled",',
            '  "dimensionType": "boolean"',
            '}',
        ].join('\n'),
    },
    {
        role: 'user' as const,
        content: [
            `Request:\n${context.prompt}`,
            `Warehouse dialect: ${context.warehouseType}`,
            `Explore: ${context.tableName}`,
            `Available references:\n${buildCustomDimensionFieldReferenceGuide(
                context.fieldsContext,
            )}`,
            context.currentSql
                ? `Current SQL to revise:\n${context.currentSql}`
                : undefined,
        ]
            .filter(Boolean)
            .join('\n\n'),
    },
];

export async function generateCustomDimension(
    modelOptions: GeneratorModelOptions,
    context: CustomDimensionContext,
): Promise<GeneratedCustomDimension> {
    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'generateCustomDimension',
        'custom-dimension',
    );
    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        experimental_telemetry: telemetry,
        schema: CustomDimensionSchema,
        messages: buildCustomDimensionMessages(context),
    });

    emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));

    return result.object;
}
