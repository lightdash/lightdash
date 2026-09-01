import { z } from 'zod';
import { isFilterExpressionOperator } from './operators';

export const filterExpressionPositionSchema = z
    .object({
        offset: z.number().int().nonnegative(),
        line: z.number().int().positive(),
        column: z.number().int().positive(),
    })
    .strict();

export const filterExpressionSpanSchema = z
    .object({
        start: filterExpressionPositionSchema,
        end: filterExpressionPositionSchema,
    })
    .strict();

const filterExpressionOperatorSchema = z
    .string()
    .refine(isFilterExpressionOperator);

const filterExpressionFieldSchema = z
    .object({
        kind: z.literal('field'),
        value: z.string().min(1),
        span: filterExpressionSpanSchema,
    })
    .strict();

const filterExpressionOperatorNodeSchema = z
    .object({
        kind: z.literal('operator'),
        value: filterExpressionOperatorSchema,
        span: filterExpressionSpanSchema,
    })
    .strict();

const filterExpressionScalarSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('bare'),
            value: z.string().min(1),
            span: filterExpressionSpanSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('quoted'),
            value: z.string(),
            span: filterExpressionSpanSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('bareNull'),
            value: z.string().refine((value) => value.toLowerCase() === 'null'),
            span: filterExpressionSpanSchema,
        })
        .strict(),
]);

const filterExpressionSettingNameSchema = z
    .object({
        kind: z.literal('settingName'),
        value: z.string().min(1),
        span: filterExpressionSpanSchema,
    })
    .strict();

const filterExpressionSettingSchema = z
    .object({
        kind: z.literal('setting'),
        name: filterExpressionSettingNameSchema,
        value: filterExpressionScalarSchema,
        span: filterExpressionSpanSchema,
    })
    .strict();

const filterExpressionSettingsSchema = z
    .object({
        kind: z.literal('settings'),
        entries: z.array(filterExpressionSettingSchema).min(1),
        span: filterExpressionSpanSchema,
    })
    .strict();

const filterExpressionRuleSchema = z
    .object({
        kind: z.literal('rule'),
        field: filterExpressionFieldSchema,
        operator: filterExpressionOperatorNodeSchema,
        arguments: z.array(filterExpressionScalarSchema),
        settings: filterExpressionSettingsSchema.optional(),
        span: filterExpressionSpanSchema,
    })
    .strict();

export const filterExpressionAstSchema = z
    .object({
        kind: z.literal('expression'),
        connector: z.enum(['and', 'or']).nullable(),
        rules: z.array(filterExpressionRuleSchema).min(1),
        span: filterExpressionSpanSchema,
    })
    .strict();

export type FilterExpressionPosition = z.infer<
    typeof filterExpressionPositionSchema
>;
export type FilterExpressionSpan = z.infer<typeof filterExpressionSpanSchema>;
export type FilterExpressionAst = z.infer<typeof filterExpressionAstSchema>;

export type FilterExpressionParseError =
    | {
          code:
              | 'FILTER_EXPRESSION_SYNTAX'
              | 'FILTER_EXPRESSION_MIXED_CONNECTORS';
          message: string;
          span: FilterExpressionSpan;
      }
    | {
          code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED';
          message: string;
          limit:
              | 'expressionLength'
              | 'ruleCount'
              | 'valueCount'
              | 'literalLength';
          maximum: number;
          actual: number;
          span: FilterExpressionSpan;
      };

export type FilterExpressionParseResult =
    | { success: true; expression: FilterExpressionAst }
    | { success: false; error: FilterExpressionParseError };
