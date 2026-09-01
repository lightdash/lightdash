/* eslint-disable class-methods-use-this, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
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

            return z
                .preprocess(
                    (val) => (val === null ? undefined : val),
                    innerType.describe(
                        [
                            schemaDescription(v),
                            schemaDescription(v.unwrap()),
                        ].join(', '),
                    ),
                )
                .transform((val: AnyType) => (val === undefined ? null : val));
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
