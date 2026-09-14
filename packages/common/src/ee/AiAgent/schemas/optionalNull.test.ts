import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { optionalNull } from './optionalNull';

describe('optionalNull', () => {
    const schema = z.object({
        pageSize: optionalNull(z.coerce.number().positive()),
        label: optionalNull(z.string()),
    });

    it('parses an omitted key to null', () => {
        expect(schema.parse({})).toEqual({ pageSize: null, label: null });
    });

    it('parses an explicit null to null', () => {
        expect(schema.parse({ pageSize: null, label: null })).toEqual({
            pageSize: null,
            label: null,
        });
    });

    it('still validates and coerces a supplied value', () => {
        expect(schema.parse({ pageSize: '25', label: 'x' })).toEqual({
            pageSize: 25,
            label: 'x',
        });
        expect(schema.safeParse({ pageSize: -1 }).success).toBe(false);
    });

    it('does not list the key as required in the JSON schema', () => {
        const jsonSchema = z.toJSONSchema(schema, { io: 'input' });
        expect(jsonSchema.required ?? []).toEqual([]);
    });
});
