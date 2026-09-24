import { z } from 'zod';
import {
    type DataAppVizFieldColorValues,
    type DataAppVizFieldOptionValues,
    type DataAppVizOptionValues,
} from '../../types/savedCharts';
import { dataAppVizFieldColorValuesSchema } from './dataAppVizFieldColorsSchema';
import { matchesDeclaredType } from './matchesDeclaredType';
import { type DataAppVizSchema } from './types';

export type DataAppVizPreview = {
    rows?: Record<string, string | number | boolean | null>[];
    optionValues?: DataAppVizOptionValues;
    fieldOptionValues?: DataAppVizFieldOptionValues;
    fieldColorValues?: DataAppVizFieldColorValues;
};

const previewValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const dataAppVizPreviewSchema = z.object({
    rows: z
        .array(z.record(z.string(), previewValueSchema.nullable()))
        .min(1)
        .max(1000)
        .optional(),
    optionValues: z.record(z.string(), previewValueSchema).optional(),
    fieldOptionValues: z
        .record(
            z.string(),
            z.record(
                z.string().min(1),
                z.record(z.string(), previewValueSchema),
            ),
        )
        .optional(),
    fieldColorValues: dataAppVizFieldColorValuesSchema.optional(),
});

export const getDataAppVizPreviewFieldId = (fieldName: string): string =>
    `sample_${fieldName}`;

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
            if (!option || !matchesDeclaredType(option, value)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['optionValues', name],
                    message: 'Unknown preview option or invalid value',
                });
            }
        });
        Object.entries(preview.fieldOptionValues ?? {}).forEach(
            ([fieldName, byId]) => {
                const field = schema.fields.find(
                    (item) => item.name === fieldName,
                );
                if (!field) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['fieldOptionValues', fieldName],
                        message: 'Unknown preview field',
                    });
                    return;
                }
                Object.entries(byId).forEach(([fieldId, options]) => {
                    if (fieldId !== getDataAppVizPreviewFieldId(fieldName)) {
                        ctx.addIssue({
                            code: 'custom',
                            path: ['fieldOptionValues', fieldName, fieldId],
                            message: `Expected preview field ID "${getDataAppVizPreviewFieldId(fieldName)}"`,
                        });
                    }
                    Object.entries(options).forEach(([name, value]) => {
                        const option = field.configOptions?.find(
                            (item) => item.name === name,
                        );
                        if (!option || !matchesDeclaredType(option, value)) {
                            ctx.addIssue({
                                code: 'custom',
                                path: [
                                    'fieldOptionValues',
                                    fieldName,
                                    fieldId,
                                    name,
                                ],
                                message:
                                    'Unknown preview field option or invalid value',
                            });
                        }
                    });
                });
            },
        );
        Object.entries(preview.fieldColorValues ?? {}).forEach(
            ([fieldName, byId]) => {
                const field = schema.fields.find(
                    (item) => item.name === fieldName,
                );
                if (
                    !field?.colorOptions?.gradient &&
                    !field?.colorOptions?.rules
                ) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['fieldColorValues', fieldName],
                        message: 'Unknown preview color field',
                    });
                }
                Object.entries(byId).forEach(([fieldId, value]) => {
                    if (fieldId !== getDataAppVizPreviewFieldId(fieldName)) {
                        ctx.addIssue({
                            code: 'custom',
                            path: ['fieldColorValues', fieldName, fieldId],
                            message: `Expected preview field ID "${getDataAppVizPreviewFieldId(fieldName)}"`,
                        });
                    }
                    if (
                        value.gradient !== undefined &&
                        !field?.colorOptions?.gradient
                    ) {
                        ctx.addIssue({
                            code: 'custom',
                            path: [
                                'fieldColorValues',
                                fieldName,
                                fieldId,
                                'gradient',
                            ],
                            message: 'Gradient is not declared for this field',
                        });
                    }
                    if (
                        value.rules !== undefined &&
                        !field?.colorOptions?.rules
                    ) {
                        ctx.addIssue({
                            code: 'custom',
                            path: [
                                'fieldColorValues',
                                fieldName,
                                fieldId,
                                'rules',
                            ],
                            message: 'Rules are not declared for this field',
                        });
                    }
                });
            },
        );
    });
