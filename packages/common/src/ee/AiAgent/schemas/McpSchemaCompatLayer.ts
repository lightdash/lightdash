/* eslint-disable class-methods-use-this */
import { SchemaCompatLayer } from '@mastra/schema-compat';
import { z } from 'zod';
import { type ZodType as ZodTypeV3 } from 'zod/v3';

const OPTIONAL_TYPES_TO_PROCESS = [
    'ZodObject',
    'ZodArray',
    'ZodUnion',
    'ZodNever',
    'ZodUndefined',
    'ZodTuple',
] as const;

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

    processZodType(value: z.ZodType): z.ZodType;
    processZodType(value: ZodTypeV3): ZodTypeV3;
    processZodType(value: z.ZodType | ZodTypeV3): z.ZodType | ZodTypeV3;
    processZodType(value: z.ZodType | ZodTypeV3): z.ZodType | ZodTypeV3 {
        if (!(value instanceof z.ZodType)) {
            throw new Error('MCP schema compatibility requires Zod 4');
        }

        return this.processZod4Type(value);
    }

    private processZod4Type(v: z.ZodType): z.ZodType {
        // Handle nullable types (e.g., z.string().nullable()) map them to optional but default to null
        if (v instanceof z.ZodNullable) {
            const nullableInner = v.unwrap() as z.ZodType;
            let innerType = this.processZod4Type(nullableInner);
            const description = v.description ?? nullableInner.description;

            // fix for `.default(...).nullable()`
            if (!this.isDefault(innerType)) {
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
                .transform((val) => (val === undefined ? null : val));

            return description ? normalized.describe(description) : normalized;
        }

        // always coerce numbers
        if (this.isNumber(v)) {
            return z.preprocess((val) => Number(val), v);
        }

        // Identical to @mastra/schema-compat/src/provider-compats/anthropic.ts
        if (this.isOptional(v)) {
            return this.defaultZodOptionalHandler(v, OPTIONAL_TYPES_TO_PROCESS);
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

        if (
            v instanceof z.ZodNever ||
            v instanceof z.ZodTuple ||
            v instanceof z.ZodUndefined
        ) {
            throw new Error(
                `${this.getModel().modelId} does not support zod type: ${v.constructor.name}`,
            );
        }

        return v;
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
