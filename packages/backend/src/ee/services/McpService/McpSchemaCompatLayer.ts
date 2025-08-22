/* eslint-disable class-methods-use-this */
import { AnyType } from '@lightdash/common';
import {
    SchemaCompatLayer,
    isArr,
    isNumber,
    isObj,
    isOptional,
    isString,
    isUnion,
} from '@mastra/schema-compat';
import { ZodDate, ZodDefault, ZodTypeAny } from 'zod';

// These are not exported by @mastra/schema-compat, so we need to define them here
// copied from source
const isDate = (value: ZodTypeAny): value is ZodDate =>
    value._def.typeName === 'ZodDate';
const isDefault = (v: ZodTypeAny): v is ZodDefault<AnyType> =>
    v instanceof ZodDefault;

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

    processZodType(value: ZodTypeAny): ZodTypeAny {
        // Handle nullable types (e.g., z.string().nullable())
        if (value._def.typeName === 'ZodNullable') {
            const innerType = this.processZodType(value._def.innerType);
            return innerType.optional();
        }

        // Identical to packages/backend/node_modules/@mastra/schema-compat/src/provider-compats/openai-reasoning.ts
        if (isOptional(value)) {
            const innerType = this.processZodType(value._def.innerType);
            return innerType.optional();
        }
        if (isObj(value)) {
            return this.defaultZodObjectHandler(value, { passthrough: false });
        }
        if (isArr(value)) {
            return this.defaultZodArrayHandler(value);
        }
        if (isUnion(value)) {
            return this.defaultZodUnionHandler(value);
        }

        if (isDefault(value)) {
            const defaultDef = value._def;
            const { innerType } = defaultDef;
            const defaultValue = defaultDef.defaultValue();
            const constraints: { defaultValue?: unknown } = {};
            if (defaultValue !== undefined) {
                constraints.defaultValue = defaultValue;
            }

            const description = this.mergeParameterDescription(
                value.description,
                constraints,
            );
            let result = this.processZodType(innerType);
            if (description) {
                result = result.describe(description);
            }
            return result;
        }
        if (isNumber(value)) {
            // This is to make sure .coerce works
            return value;
        }
        if (isString(value)) {
            return this.defaultZodStringHandler(value);
        }
        if (isDate(value)) {
            return this.defaultZodDateHandler(value);
        }
        return this.defaultUnsupportedZodTypeHandler(value);
    }
}
