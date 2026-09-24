import { z } from 'zod';
import { type DataAppVizOptionValues } from '../../types/savedCharts';
import assertUnreachable from '../../utils/assertUnreachable';
import {
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from './dataAppVizConfigOptions';
import { dataAppVizGradientValueSchema } from './dataAppVizGradient';
import { type DataAppVizSchema } from './types';

export type DataAppVizPreview = {
    rows?: Record<string, string | number | boolean | null>[];
    optionValues?: DataAppVizOptionValues;
};

const previewValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const dataAppVizPreviewSchema = z.object({
    rows: z
        .array(z.record(z.string(), previewValueSchema.nullable()))
        .min(1)
        .max(1000)
        .optional(),
    optionValues: z
        .record(
            z.string(),
            z.union([previewValueSchema, dataAppVizGradientValueSchema]),
        )
        .optional(),
});

const matchesPreviewOptionType = (
    option: DataAppVizConfigOption,
    value: DataAppVizOptionValue,
): boolean => {
    switch (option.type) {
        case 'select':
            return option.choices.some((choice) => choice.value === value);
        case 'color':
        case 'text':
            return typeof value === 'string';
        case 'boolean':
        case 'number':
            return typeof value === option.type;
        case 'gradient':
            return typeof value === 'object';
        default:
            return assertUnreachable(option, 'Unknown config option type');
    }
};

export const getDataAppVizPreviewSchema = (schema: DataAppVizSchema) =>
    dataAppVizPreviewSchema.superRefine((preview, ctx) => {
        const fieldNames = new Set(schema.fields.map((field) => field.name));
        preview.rows?.forEach((row, index) => {
            Object.keys(row).forEach((name) => {
                if (!fieldNames.has(name)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['rows', index, name],
                        message: 'Unknown preview field',
                    });
                }
            });
            schema.fields.forEach((field) => {
                if (field.required && !Object.hasOwn(row, field.name)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['rows', index, field.name],
                        message: 'Missing required preview field',
                    });
                }
            });
        });
        Object.entries(preview.optionValues ?? {}).forEach(([name, value]) => {
            const option = schema.configOptions.find(
                (item) => item.name === name,
            );
            const valid = option && matchesPreviewOptionType(option, value);
            if (!valid) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['optionValues', name],
                    message: 'Unknown preview option or invalid value',
                });
            }
        });
    });
