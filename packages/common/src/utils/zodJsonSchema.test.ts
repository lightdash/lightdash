import { z } from 'zod';
import { toJsonSchema, toLlmJsonSchema } from './zodJsonSchema';

describe('toJsonSchema', () => {
    test('is the native conversion the MCP SDK serves: open objects', () => {
        expect(
            toJsonSchema(z.object({ value: z.string() }), { io: 'input' }),
        ).not.toHaveProperty('additionalProperties');
    });
});

describe('toLlmJsonSchema', () => {
    test('closes regular objects and keeps loose ones open', () => {
        expect(
            toLlmJsonSchema(
                z.object({
                    nested: z.object({ value: z.string() }),
                    loose: z.looseObject({ value: z.string() }),
                    record: z.record(z.string(), z.number()),
                }),
            ),
        ).toMatchObject({
            additionalProperties: false,
            properties: {
                nested: { additionalProperties: false },
                loose: { additionalProperties: {} },
                record: { additionalProperties: { type: 'number' } },
            },
        });
    });

    test('collapses nullable fields onto one schema and keeps the description on the property', () => {
        const { properties } = toLlmJsonSchema(
            z.object({
                before: z.boolean().describe('Described before').nullable(),
                after: z.string().nullable().describe('Described after'),
                enumeration: z.enum(['a', 'b']).nullable(),
                literal: z.literal('only').nullable(),
            }),
        );

        expect(properties).toEqual({
            before: {
                type: ['boolean', 'null'],
                description: 'Described before',
            },
            after: { type: ['string', 'null'], description: 'Described after' },
            enumeration: { type: ['string', 'null'], enum: ['a', 'b', null] },
            literal: { type: ['string', 'null'], enum: ['only', null] },
        });
    });

    test('encodes literal unions as an enum', () => {
        expect(
            toLlmJsonSchema(
                z.object({
                    connector: z
                        .union([z.literal('and'), z.literal('or')])
                        .describe('Connector'),
                }),
            ).properties,
        ).toEqual({
            connector: {
                type: 'string',
                enum: ['and', 'or'],
                description: 'Connector',
            },
        });
    });

    test('hoists a lone branch description out of an object union', () => {
        const { properties } = toLlmJsonSchema(
            z.object({
                choice: z
                    .union([
                        z.object({ a: z.string() }),
                        z.object({ b: z.string() }),
                    ])
                    .describe('Described union')
                    .nullable(),
            }),
        );

        expect(properties?.choice).toMatchObject({
            description: 'Described union',
            anyOf: [{ type: 'object' }, { type: 'object' }, { type: 'null' }],
        });
    });

    test('leaves a union of described objects alone', () => {
        const { properties } = toLlmJsonSchema(
            z.object({
                choice: z.union([
                    z.object({ a: z.string() }).describe('First'),
                    z.object({ b: z.string() }).describe('Second'),
                ]),
            }),
        );

        expect(properties?.choice).not.toHaveProperty('description');
    });

    test('drops the record key schema and safe-integer bounds', () => {
        const { properties } = toLlmJsonSchema(
            z.object({
                count: z.number().int(),
                bounded: z.number().int().max(10),
                record: z.record(z.string(), z.unknown()),
            }),
        );

        expect(properties?.count).toEqual({ type: 'integer' });
        expect(properties?.bounded).toEqual({ type: 'integer', maximum: 10 });
        expect(properties?.record).not.toHaveProperty('propertyNames');
    });

    test('keeps large shared schemas as refs and normalizes them', () => {
        const shared = z.object({
            value: z.string().nullable().describe('A'.repeat(200)),
        });
        const schema = toLlmJsonSchema(
            z.object({ first: shared, second: shared }),
            { reused: 'ref' },
        );

        expect(schema.properties?.first).toEqual({
            $ref: '#/definitions/__schema0',
        });
        expect(Object.values(schema.definitions ?? {})[0]).toMatchObject({
            additionalProperties: false,
            properties: { value: { type: ['string', 'null'] } },
        });
    });

    test('inlines small shared schemas instead of referencing them', () => {
        const connector = z.union([z.literal('and'), z.literal('or')]);
        const schema = toLlmJsonSchema(
            z.object({ first: connector, second: connector.nullable() }),
            { reused: 'ref' },
        );

        expect(schema).not.toHaveProperty('definitions');
        expect(schema.properties).toEqual({
            first: { type: 'string', enum: ['and', 'or'] },
            second: { type: ['string', 'null'], enum: ['and', 'or', null] },
        });
    });

    test('keeps requiredness from the schema itself', () => {
        expect(
            toLlmJsonSchema(
                z.object({
                    coerced: z.coerce.number(),
                    optional: z.string().optional(),
                    defaulted: z.string().default('default'),
                    nullable: z.string().nullable(),
                }),
            ).required,
        ).toEqual(['coerced', 'nullable']);
    });
});
