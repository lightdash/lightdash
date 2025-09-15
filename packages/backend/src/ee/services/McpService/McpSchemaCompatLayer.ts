/* eslint-disable class-methods-use-this */
import { AnyType } from '@lightdash/common';
import {
    type AllZodType,
    isArr,
    isNumber,
    isObj,
    isOptional,
    isString,
    isUnion,
    SchemaCompatLayer,
} from '@mastra/schema-compat';
import { z, ZodDefault, ZodNullable, ZodType, type ZodTypeAny } from 'zod';

const isNullable = (v: ZodTypeAny): v is ZodNullable<AnyType> =>
    v._def.typeName === 'ZodNullable';

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
        // Handle nullable types (e.g., z.string().nullable()) map them to optional but default to null
        if (isNullable(value)) {
            let innerType = this.processZodType(value._def.innerType);

            // fix for `.default(...).nullable()`
            if (!(innerType instanceof ZodDefault)) {
                innerType = innerType.optional();
            }

            return innerType
                .describe(
                    [
                        value.description ?? '',
                        value._def.innerType.description ?? '',
                    ].join(', '),
                )
                .transform((val: AnyType) => (val === undefined ? null : val));
        }

        // always coerce numbers
        if (isNumber(value)) {
            return z.preprocess((val) => Number(val), value);
        }

        // Identical to packages/backend/node_modules/@mastra/schema-compat/src/provider-compats/anthropic.ts
        if (isOptional(value)) {
            const handleTypes: AllZodType[] = [
                'ZodObject',
                'ZodArray',
                'ZodUnion',
                'ZodNever',
                'ZodUndefined',
                'ZodTuple',
            ];
            return this.defaultZodOptionalHandler(value, handleTypes);
        }
        if (isObj(value)) {
            return this.defaultZodObjectHandler(value);
        }
        if (isArr(value)) {
            return this.defaultZodArrayHandler(value, []);
        }
        if (isUnion(value)) {
            return this.defaultZodUnionHandler(value);
        }
        if (isString(value)) {
            return value;
        }

        return this.defaultUnsupportedZodTypeHandler(value, [
            'ZodNever',
            'ZodTuple',
            'ZodUndefined',
        ]);
    }
}
