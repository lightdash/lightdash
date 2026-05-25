import z, { type ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { type ToolInput } from './defineTool';
import { McpSchemaCompatLayer } from './mcpSchemaCompat';
import { findFieldsTool, runQueryTool } from './tools';

const mcpSchemaCompatLayer = new McpSchemaCompatLayer();

const mapZodSchema = <T>(schema: ZodSchema): ZodSchema<T> =>
    mcpSchemaCompatLayer.processZodType(schema) as ZodSchema<T>;

describe('McpSchemaCompatLayer', () => {
    describe('baseline', () => {
        const schema = z.object({
            name: z.string().describe('The name of the person'),
            age: z.coerce.number().describe('The age of the person'),
            bio: z.string().nullable().describe('The bio of the person'),
            details: z
                .object({
                    height: z.number().describe('The height of the person'),
                    weight: z.coerce
                        .number()
                        .min(1)
                        .int()
                        .describe('The weight of the person')
                        .nullable(),
                    hair: z
                        .object({
                            color: z
                                .string()
                                .nullable()
                                .describe('The color of the hair'),
                            length: z
                                .string()
                                .nullable()
                                .describe('The length of the hair'),
                        })
                        .nullable()
                        .describe('The hair of the person'),
                })
                .nullable()
                .describe('The details of the person'),
            pets: z
                .array(
                    z
                        .union([
                            z.object({
                                type: z.literal('dog'),
                                name: z
                                    .string()
                                    .describe('The name of the dog'),
                                breed: z
                                    .union([
                                        z
                                            .literal('labrador')
                                            .describe(
                                                'the most popular dog breed',
                                            ),
                                        z
                                            .literal('golden retriever')
                                            .describe(
                                                'the second most popular dog breed',
                                            ),
                                    ])
                                    .nullable()
                                    .describe('The breed of the dog'),
                                barks: z
                                    .boolean()
                                    .describe('Whether the dog barks')
                                    .nullable(),
                            }),
                            z.object({
                                type: z.literal('cat'),
                                name: z
                                    .string()
                                    .describe('The name of the cat'),
                                meows: z
                                    .boolean()
                                    .describe('Whether the cat meows')
                                    .nullable(),
                            }),
                        ])
                        .describe('pet description'),
                )
                .nullable()
                .describe('pets of the person'),
            preference: z
                .enum(['dog person', 'cat person'])
                .nullable()
                .describe('The preference of the person'),
            occupation: z
                .string()
                .default('plumber')
                .nullable()
                .describe('The occupation of the person'),
        });

        const mapped: ZodSchema<z.infer<typeof schema>> = mapZodSchema(schema);

        test('should handle top-level nullable types', () => {
            expect(
                mapped.parse({
                    name: 'John',
                    age: 30,
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: null,
                details: null,
                pets: null,
                preference: null,
                occupation: 'plumber',
            });
        });

        test('should handle nullable-object', () => {
            expect(
                mapped.parse({
                    name: 'John',
                    age: 30,
                    bio: 'hello',
                    details: {
                        height: 180,
                    },
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: 'hello',
                details: {
                    height: 180,
                    weight: null,
                    hair: null,
                },
                pets: null,
                preference: null,
                occupation: 'plumber',
            });

            expect(
                mapped.parse({
                    name: 'John',
                    age: 30,
                    bio: 'hello',
                    details: {
                        height: 180,
                        weight: 70,
                        hair: {
                            color: 'brown',
                        },
                    },
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: 'hello',
                details: {
                    height: 180,
                    weight: 70,
                    hair: {
                        color: 'brown',
                        length: null,
                    },
                },
                pets: null,
                preference: null,
                occupation: 'plumber',
            });
        });

        test('should handle enum', () => {
            expect(
                mapped.parse({
                    name: 'John',
                    age: 30,
                    preference: 'dog person',
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: null,
                details: null,
                pets: null,
                preference: 'dog person',
                occupation: 'plumber',
            });
        });

        test('should handle nullable-array', () => {
            expect(
                mapped.parse({
                    name: 'John',
                    age: 30,
                    bio: 'hello',
                    pets: [
                        {
                            type: 'dog',
                            name: 'Rex',
                        },
                        {
                            type: 'cat',
                            name: 'Whiskers',
                        },
                    ],
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: 'hello',
                details: null,
                pets: [
                    {
                        type: 'dog',
                        name: 'Rex',
                        breed: null,
                        barks: null,
                    },
                    {
                        type: 'cat',
                        name: 'Whiskers',
                        meows: null,
                    },
                ],
                preference: null,
                occupation: 'plumber',
            });

            expect(
                mapped.parse({
                    name: 'John',
                    age: 30,
                    bio: 'hello',
                    pets: [
                        {
                            type: 'dog',
                            name: 'Rex',
                            breed: 'labrador',
                            barks: true,
                        },
                        {
                            type: 'cat',
                            name: 'Whiskers',
                            meows: false,
                        },
                    ],
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: 'hello',
                details: null,
                pets: [
                    {
                        type: 'dog',
                        name: 'Rex',
                        breed: 'labrador',
                        barks: true,
                    },
                    {
                        type: 'cat',
                        name: 'Whiskers',
                        meows: false,
                    },
                ],
                preference: null,
                occupation: 'plumber',
            });
        });

        test('should handle number coercion', () => {
            expect(
                mapped.parse({
                    name: 'John',
                    age: '30',
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: null,
                details: null,
                pets: null,
                preference: null,
                occupation: 'plumber',
            });

            expect(
                mapped.parse({
                    name: 'John',
                    age: '30',
                    bio: 'hello',
                    details: {
                        height: 180,
                        weight: '70',
                    },
                }),
            ).toEqual({
                name: 'John',
                age: 30,
                bio: 'hello',
                details: {
                    height: 180,
                    weight: 70,
                    hair: null,
                },
                pets: null,
                preference: null,
                occupation: 'plumber',
            });
        });

        test('should handle default().nullable() and nullable().default()', () => {
            const fooSchema = z.object({
                foo: z.boolean().describe('foo').nullable().default(true),
            });
            const mappedX = mapZodSchema<z.infer<typeof fooSchema>>(fooSchema);
            expect(
                mappedX.parse({
                    foo: true,
                }),
            ).toEqual({
                foo: true,
            });

            expect(mappedX.parse({})).toEqual({
                foo: true,
            });

            const barSchema = z.object({
                bar: z.boolean().describe('bar').default(true).nullable(),
            });

            const mappedBar =
                mapZodSchema<z.infer<typeof barSchema>>(barSchema);
            expect(
                mappedBar.parse({
                    bar: true,
                }),
            ).toEqual({
                bar: true,
            });

            expect(mappedBar.parse({})).toEqual({
                bar: true,
            });
        });

        test('should handle transforms', () => {
            const fooSchema = z.object({
                foo: z
                    .object({
                        bar: z.string(),
                    })
                    .nullable(),
            });

            const fooTransformed = fooSchema.transform((val) => ({
                foo: val.foo ? { bar: val.foo.bar } : { bar: 'baz' },
            }));

            const mappedFoo =
                mapZodSchema<z.infer<typeof fooTransformed>>(fooSchema);

            expect(fooTransformed.parse(mappedFoo.parse({}))).toEqual({
                foo: { bar: 'baz' },
            });
        });

        test('should handle .positive/.int anumbers', () => {
            expect(
                mapped.safeParse({
                    name: 'John',
                    age: 30,
                    bio: 'hello',
                    details: {
                        height: 180,
                        weight: 70.2,
                    },
                }).error?.issues?.[0]?.code,
            ).toBe('invalid_type');
            expect(
                mapped.safeParse({
                    name: 'John',
                    age: 30,
                    bio: 'hello',
                    details: {
                        height: 180,
                        weight: -70,
                    },
                }).error?.issues?.[0]?.code,
            ).toBe('too_small');
        });
    });

    describe('JSON Schema $ref generation', () => {
        // Regression test: zodToJsonSchema must not produce $ref pointers in
        // the run_metric_query schema (toolRunQueryArgsSchema). The MCP Gateway
        // cannot resolve them and returns 500 ERR_INVALID_URL when filters are
        // present.
        test('toolRunQueryArgsSchema should not produce $ref pointers', () => {
            const processed = mcpSchemaCompatLayer.processZodType(
                runQueryTool.inputSchema,
            );
            const jsonSchema = zodToJsonSchema(processed, {
                strictUnions: true,
                pipeStrategy: 'input',
            });
            const serialized = JSON.stringify(jsonSchema);
            expect(serialized).not.toContain('"$ref"');
        });
    });

    describe('pagination schema', () => {
        const schema = findFieldsTool.inputSchema;
        const schemaTransformed = findFieldsTool.inputSchemaTransformed;
        const mapped = mapZodSchema<ToolInput<typeof findFieldsTool>>(schema);

        const base = {
            table: 'test',
            fieldSearchQueries: [
                {
                    label: 'test',
                },
            ],
        };

        test('should handle pagination', () => {
            expect(
                mapped.parse({
                    ...base,
                }),
            ).toEqual({
                ...base,
                page: null,
            });

            expect(
                mapped.parse({
                    ...base,
                    page: 1,
                }),
            ).toEqual({
                ...base,
                page: 1,
            });

            expect(
                mapped.parse({
                    ...base,
                    page: '23',
                }),
            ).toEqual({
                ...base,
                page: 23,
            });

            expect(() =>
                schemaTransformed.parse(
                    mapped.parse({
                        ...base,
                        page: '23',
                    }),
                ),
            ).not.toThrow();
        });
    });
});
