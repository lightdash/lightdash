/* eslint-disable class-methods-use-this */
import { AnyType } from '@lightdash/common';
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
    ZodDiscriminatedUnion,
    ZodNullable,
    type ZodTypeAny,
} from 'zod';

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
