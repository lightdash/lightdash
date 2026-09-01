import { z } from 'zod';
import { toJsonSchema } from './zodJsonSchema';

describe('toJsonSchema', () => {
    test('keeps regular input objects closed', () => {
        expect(
            toJsonSchema(
                z.object({
                    nested: z.object({ value: z.string() }),
                }),
                { io: 'input' },
            ),
        ).toMatchObject({
            additionalProperties: false,
            properties: {
                nested: {
                    additionalProperties: false,
                },
            },
        });
    });

    test('preserves explicitly loose input objects', () => {
        expect(
            toJsonSchema(z.looseObject({ value: z.string() }), {
                io: 'input',
            }),
        ).toMatchObject({
            additionalProperties: {},
        });
    });

    test('keeps coercion fields required when they reject undefined', () => {
        expect(
            toJsonSchema(
                z.object({
                    coerced: z.coerce.number(),
                    optional: z.string().optional(),
                    defaulted: z.string().default('default'),
                    unknown: z.unknown(),
                }),
                { io: 'input' },
            ),
        ).toMatchObject({
            required: ['coerced'],
        });
    });
});
