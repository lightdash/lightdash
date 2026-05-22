/* eslint-disable no-underscore-dangle */
import { z, ZodDefault, type ZodRawShape, type ZodTypeAny } from 'zod';

type ZodTypeWithInternalDef<TSchema extends ZodTypeAny = ZodTypeAny> =
    TSchema & {
        _def: {
            typeName: z.ZodFirstPartyTypeKind;
        };
    };

const getTypeName = (value: ZodTypeAny): z.ZodFirstPartyTypeKind =>
    // Zod does not expose a typed public discriminator for these internals.
    // This module is the one sanctioned boundary where we inspect `_def`.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (value as ZodTypeWithInternalDef)._def.typeName;

const isNullable = (value: ZodTypeAny): value is z.ZodNullable<ZodTypeAny> =>
    getTypeName(value) === z.ZodFirstPartyTypeKind.ZodNullable;

const isOptional = (value: ZodTypeAny): value is z.ZodOptional<ZodTypeAny> =>
    getTypeName(value) === z.ZodFirstPartyTypeKind.ZodOptional;

const isObject = (value: ZodTypeAny): value is z.AnyZodObject =>
    getTypeName(value) === z.ZodFirstPartyTypeKind.ZodObject;

const isArray = (value: ZodTypeAny): value is z.ZodArray<ZodTypeAny> =>
    getTypeName(value) === z.ZodFirstPartyTypeKind.ZodArray;

const isUnion = (
    value: ZodTypeAny,
): value is z.ZodUnion<[ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]> =>
    getTypeName(value) === z.ZodFirstPartyTypeKind.ZodUnion;

const isDiscriminatedUnion = (value: ZodTypeAny): boolean =>
    getTypeName(value) === z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion;

const isNumber = (value: ZodTypeAny): value is z.ZodNumber =>
    getTypeName(value) === z.ZodFirstPartyTypeKind.ZodNumber;

const cloneZodInstance = <TSchema extends ZodTypeAny>(
    schema: TSchema,
): TSchema =>
    new (schema.constructor as new (def: TSchema['_def']) => TSchema)({
        ...(schema as ZodTypeWithInternalDef<TSchema>)._def,
    });

const processZodType = (value: ZodTypeAny): ZodTypeAny => {
    const schema = cloneZodInstance(value);

    if (isNullable(schema)) {
        const processedInner = processZodType(schema.unwrap());
        const optionalInner =
            processedInner instanceof ZodDefault
                ? processedInner
                : processedInner.optional();

        return optionalInner
            .describe(
                [
                    schema.description ?? '',
                    schema.unwrap().description ?? '',
                ].join(', '),
            )
            .transform((parsedValue) =>
                parsedValue === undefined ? null : parsedValue,
            );
    }

    if (isNumber(schema)) {
        return z.preprocess((parsedValue) => Number(parsedValue), schema);
    }

    if (isOptional(schema)) {
        return processZodType(schema.unwrap()).optional();
    }

    if (isObject(schema)) {
        const processedShape = Object.fromEntries(
            Object.entries(schema.shape as ZodRawShape).map(
                ([key, childSchema]) => [key, processZodType(childSchema)],
            ),
        ) as ZodRawShape;

        return z.object(processedShape);
    }

    if (isArray(schema)) {
        return z.array(processZodType(schema.element));
    }

    if (isDiscriminatedUnion(schema)) {
        const [firstOption, secondOption, ...restOptions] = Array.from(
            (
                schema as z.ZodDiscriminatedUnion<
                    string,
                    [z.AnyZodObject, z.AnyZodObject, ...z.AnyZodObject[]]
                >
            ).options.values(),
        ) as [z.AnyZodObject, z.AnyZodObject, ...z.AnyZodObject[]];
        return z.union([
            processZodType(firstOption),
            processZodType(secondOption),
            ...restOptions.map((option) => processZodType(option)),
        ]);
    }

    if (isUnion(schema)) {
        const [firstOption, secondOption, ...restOptions] = schema.options;
        return z.union([
            processZodType(firstOption),
            processZodType(secondOption),
            ...restOptions.map((option) => processZodType(option)),
        ]);
    }

    return schema;
};

export const getMcpCompatibleSchema = <TShape extends ZodRawShape>(
    schema: z.ZodObject<TShape>,
): ZodRawShape => {
    const processedSchema = processZodType(schema);

    if (!isObject(processedSchema)) {
        throw new Error('Expected MCP-compatible schema to remain a ZodObject');
    }

    return processedSchema.shape;
};
