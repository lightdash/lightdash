/* eslint-disable class-methods-use-this, no-underscore-dangle, no-continue, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
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
import { z, ZodDefault } from 'zod';
import { type AnyType } from '../../../types/any';

const cloneZodInstance = (v: AnyType): AnyType =>
    (v as z.ZodType).clone() as AnyType;

const schemaDescription = (schema: AnyType): string =>
    (schema as { description?: string }).description ?? '';

export class McpSchemaCompatLayer extends SchemaCompatLayer {
    constructor() {
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
        return true;
    }

    processZodType(value: AnyType): AnyType {
        const v = cloneZodInstance(value);

        if (v instanceof z.ZodNullable) {
            let innerType = this.processZodType(v.unwrap());

            if (!(innerType instanceof ZodDefault)) {
                innerType = innerType.optional();
            }

            // Zod 4 `z.toJSONSchema` treats preprocess+transform pipes as
            // unrepresentable (`{}` + required). Keep a representable
            // optional+nullable so MCP tool listings stay draft-07 objects.
            // https://zod.dev/v4/changelog
            return innerType
                .nullable()
                .describe(
                    [schemaDescription(v), schemaDescription(v.unwrap())].join(
                        ', ',
                    ),
                );
        }

        if (isNumber(v)) {
            return z.preprocess((val) => Number(val), v);
        }

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
        if (v instanceof z.ZodDiscriminatedUnion) {
            const { options } = v as z.ZodDiscriminatedUnion & {
                options: z.ZodType[];
            };
            return this.defaultZodUnionHandler(
                z.union(
                    options.map((opt) => this.processZodType(opt)) as [
                        z.ZodType,
                        z.ZodType,
                        ...z.ZodType[],
                    ],
                ),
            );
        }
        if (isString(v)) {
            return v;
        }

        return this.defaultUnsupportedZodTypeHandler(v);
    }
}

const mcpSchemaCompatLayer = new McpSchemaCompatLayer();

const zodDefType = (schema: AnyType): string | undefined =>
    schema?._zod?.def?.type ?? schema?.def?.type;

const unwrapField = (schema: AnyType): { core: AnyType; nullable: boolean } => {
    let current = schema;
    let nullable = false;
    for (let i = 0; i < 10 && current; i += 1) {
        const type = zodDefType(current);
        if (type === 'nullable') {
            nullable = true;
            current =
                typeof current.unwrap === 'function'
                    ? current.unwrap()
                    : current._zod?.def?.innerType;
            continue;
        }
        if (type === 'optional' || type === 'default') {
            current =
                typeof current.unwrap === 'function'
                    ? current.unwrap()
                    : current._zod?.def?.innerType;
            continue;
        }
        if (type === 'pipe') {
            current = current.out ?? current._zod?.def?.out;
            continue;
        }
        break;
    }
    return { core: current, nullable };
};

const fillOmittedNullables = (schema: AnyType, value: unknown): unknown => {
    if (value === null || value === undefined) {
        return value;
    }
    const { core } = unwrapField(schema);
    const type = zodDefType(core);
    if (
        type === 'object' &&
        typeof value === 'object' &&
        !Array.isArray(value)
    ) {
        const shape = (core.shape ?? {}) as Record<string, AnyType>;
        const result: Record<string, unknown> = {
            ...(value as Record<string, unknown>),
        };
        for (const [key, field] of Object.entries(shape)) {
            const fieldMeta = unwrapField(field);
            if (result[key] === undefined && fieldMeta.nullable) {
                result[key] = null;
            } else if (result[key] !== undefined) {
                result[key] = fillOmittedNullables(field, result[key]);
            }
        }
        return result;
    }
    if (Array.isArray(value) && (type === 'array' || core.element)) {
        const item = core.element ?? core._zod?.def?.element;
        return value.map((entry) => fillOmittedNullables(item, entry));
    }
    if (
        type === 'union' &&
        typeof value === 'object' &&
        !Array.isArray(value)
    ) {
        const options = (core.options ??
            core._zod?.def?.options ??
            []) as AnyType[];
        for (const option of options) {
            const parsed = option.safeParse?.(value);
            if (parsed?.success) {
                return fillOmittedNullables(option, value);
            }
        }
    }
    return value;
};

const withOmittedNullableFill = <T extends z.ZodType>(schema: T): T => {
    const parse = schema.parse.bind(schema);
    const safeParse = schema.safeParse.bind(schema);
    const patched = schema as AnyType;
    patched.parse = (data: unknown) =>
        fillOmittedNullables(schema, parse(data));
    patched.safeParse = (data: unknown) => {
        const result = safeParse(data);
        if (result.success) {
            return {
                ...result,
                data: fillOmittedNullables(schema, result.data),
            };
        }
        return result;
    };
    return schema;
};

export type McpCompatibleInputSchema<
    TInput extends z.ZodObject<z.ZodRawShape>,
> = z.ZodObject<TInput['shape']>;

export const createMcpCompatibleInputSchema = <
    TInput extends z.ZodObject<z.ZodRawShape>,
>(
    inputSchema: TInput,
): McpCompatibleInputSchema<TInput> =>
    withOmittedNullableFill(
        mcpSchemaCompatLayer.processZodType(
            inputSchema,
        ) as McpCompatibleInputSchema<TInput>,
    );

export const createMcpCompatibleInputShape = <
    TInput extends z.ZodObject<z.ZodRawShape>,
>(
    inputSchema: TInput,
): TInput['shape'] => createMcpCompatibleInputSchema(inputSchema).shape;
