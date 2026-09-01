/* eslint-disable class-methods-use-this, no-underscore-dangle, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { SchemaCompatLayer, type AllZodType } from '@mastra/schema-compat';
import { z, ZodDefault } from 'zod';
import { type AnyType } from '../../../types/any';

export class McpSchemaCompatLayer extends SchemaCompatLayer {
    constructor() {
        // We don't need a real model for MCP, just pass dummy info
        super({
            modelId: 'mcp-lightdash',
            provider: 'lightdash',
            supportsStructuredOutputs: true,
        });
    }

    getSchemaTarget() {
        return 'jsonSchema7' as const;
    }

    shouldApply() {
        // Always apply this compatibility layer when explicitly used
        return true;
    }

    processZodType(value: AnyType): AnyType {
        const v = value as z.ZodType;

        // Handle nullable types (e.g., z.string().nullable()) map them to optional but default to null
        if (v instanceof z.ZodNullable) {
            let innerType = this.processZodType(v.unwrap());
            const description =
                v.description ?? (v.unwrap() as z.ZodType).description;

            // fix for `.default(...).nullable()`
            if (!(innerType instanceof ZodDefault)) {
                innerType = innerType.optional();
            }

            // Accept an explicit null too: descriptions advertise nullable
            // fields as "or null", so MCP clients send null as often as they
            // omit the key. Coerce it to undefined before validation and let
            // the transform below restore null on output.
            const normalized = z
                .preprocess(
                    (val) => (val === null ? undefined : val),
                    description ? innerType.describe(description) : innerType,
                )
                .transform((val: AnyType) => (val === undefined ? null : val));

            return description ? normalized.describe(description) : normalized;
        }

        // always coerce numbers
        if (this.isNumber(v)) {
            return z.preprocess((val) => Number(val), v);
        }

        // Identical to @mastra/schema-compat/src/provider-compats/anthropic.ts
        if (this.isOptional(v)) {
            const handleTypes: AllZodType[] = [
                'ZodObject',
                'ZodArray',
                'ZodUnion',
                'ZodNever',
                'ZodUndefined',
                'ZodTuple',
            ];
            return this.defaultZodOptionalHandler(v, handleTypes);
        }
        if (this.isObj(v)) {
            return this.defaultZodObjectHandler(v);
        }
        if (this.isArr(v)) {
            return this.defaultZodArrayHandler(v, []);
        }
        if (this.isUnion(v)) {
            return this.defaultZodUnionHandler(v);
        }
        if (this.isString(v)) {
            return v;
        }

        return this.defaultUnsupportedZodTypeHandler(
            v as AnyType,
            ['ZodNever', 'ZodTuple', 'ZodUndefined'] as AnyType,
        );
    }
}

const mcpSchemaCompatLayer = new McpSchemaCompatLayer();

export type McpCompatibleInputSchema<
    TInput extends z.ZodObject<z.ZodRawShape>,
> = z.ZodObject<TInput['shape']>;

export const createMcpCompatibleInputSchema = <
    TInput extends z.ZodObject<z.ZodRawShape>,
>(
    inputSchema: TInput,
): McpCompatibleInputSchema<TInput> =>
    mcpSchemaCompatLayer.processZodType(
        inputSchema,
    ) as McpCompatibleInputSchema<TInput>;

export const createMcpCompatibleInputShape = <
    TInput extends z.ZodObject<z.ZodRawShape>,
>(
    inputSchema: TInput,
): TInput['shape'] => createMcpCompatibleInputSchema(inputSchema).shape;
