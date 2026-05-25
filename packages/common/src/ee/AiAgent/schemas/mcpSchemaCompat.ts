/* eslint-disable class-methods-use-this */
// This layer walks zod's internal `_def` nodes with intentionally loose `any`
// typing (kept as-is from its previous backend home). The unsafe access is
// inherent to a schema-internals walker and is contained to this one file —
// `toMcpInputShape` is the only typed boundary consumers touch.
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
    isArr,
    isNumber,
    isObj,
    isOptional,
    isString,
    isUnion,
    SchemaCompatLayer,
    type AllZodType,
} from '@mastra/schema-compat';
import {
    z,
    ZodDefault,
    type ZodDiscriminatedUnion,
    type ZodNullable,
    type ZodTypeAny,
} from 'zod';
import { type AnyType } from '../../../types/any';

const isNullable = (v: ZodTypeAny): v is ZodNullable<AnyType> =>
    v._def.typeName === 'ZodNullable';

const isDiscriminatedUnion = (
    v: ZodTypeAny,
): v is ZodDiscriminatedUnion<string, AnyType> =>
    v._def.typeName === 'ZodDiscriminatedUnion';

/**
 * Create a new Zod schema instance with the same _def but a distinct object
 * identity. zodToJsonSchema uses reference equality to detect shared schemas
 * and emits $ref pointers for them. The MCP Gateway cannot resolve those
 * pointers and returns 500 ERR_INVALID_URL. By cloning every node during
 * processZodType, we guarantee all output instances are unique.
 */
const cloneZodInstance = (v: AnyType): AnyType =>
    new (v.constructor as new (def: AnyType) => AnyType)({ ...v._def });

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
        // Clone the node so every processed schema has a unique identity.
        // This prevents zodToJsonSchema from generating $ref pointers when
        // the MCP SDK converts the schema for tool listing.
        const v = cloneZodInstance(value);

        // Handle nullable types (e.g., z.string().nullable()) map them to optional but default to null
        if (isNullable(v)) {
            let innerType = this.processZodType(v._def.innerType);

            // fix for `.default(...).nullable()`
            if (!(innerType instanceof ZodDefault)) {
                innerType = innerType.optional();
            }

            return innerType
                .describe(
                    [
                        v.description ?? '',
                        v._def.innerType.description ?? '',
                    ].join(', '),
                )
                .transform((val: AnyType) => (val === undefined ? null : val));
        }

        // always coerce numbers
        if (isNumber(v)) {
            return z.preprocess((val) => Number(val), v);
        }

        // Identical to packages/backend/node_modules/@mastra/schema-compat/src/provider-compats/anthropic.ts
        if (isOptional(v)) {
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
        if (isObj(v)) {
            return this.defaultZodObjectHandler(v);
        }
        if (isArr(v)) {
            return this.defaultZodArrayHandler(v, []);
        }
        if (isUnion(v)) {
            return this.defaultZodUnionHandler(v);
        }
        // ZodDiscriminatedUnion is not recognized by isUnion() from
        // @mastra/schema-compat, so handle it explicitly by converting to a
        // regular union. This ensures its variants are recursively processed
        // (and therefore cloned) to prevent $ref generation.
        if (isDiscriminatedUnion(v)) {
            return this.defaultZodUnionHandler(
                z.union(
                    v._def.options.map((opt: AnyType) =>
                        this.processZodType(opt),
                    ),
                ),
            );
        }
        if (isString(v)) {
            return v;
        }

        return this.defaultUnsupportedZodTypeHandler(v, [
            'ZodNever',
            'ZodTuple',
            'ZodUndefined',
        ]);
    }
}

// Single instance — created lazily so merely importing this module (e.g. from a
// frontend bundle that only reads tool names/types) doesn't instantiate the
// layer until an MCP input shape is actually requested.
let mcpCompatLayer: McpSchemaCompatLayer | null = null;

/**
 * Apply the MCP input-schema compat transform and return the raw shape that
 * `registerTool` expects. Typed as the original schema's shape so call sites
 * (and the MCP SDK) infer concrete handler args; the runtime value is the
 * transformed shape (same keys, coercion-friendly validators). This is the
 * one boundary where the layer's intentionally loose `any` typing is consumed.
 */
export const toMcpInputShape = <TInput extends z.ZodObject<z.ZodRawShape>>(
    schema: TInput,
): TInput['shape'] => {
    if (!mcpCompatLayer) {
        mcpCompatLayer = new McpSchemaCompatLayer();
    }
    return mcpCompatLayer.processZodType(schema).shape;
};
