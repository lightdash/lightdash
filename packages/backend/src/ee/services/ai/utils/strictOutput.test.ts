import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertStrictModeSafe } from './strictOutput';

describe('assertStrictModeSafe', () => {
    const A = z.object({ t: z.literal('a') }).strict();
    const B = z.object({ t: z.literal('b') }).strict();
    it('rejects discriminatedUnion and names the fix', () => {
        expect(() =>
            assertStrictModeSafe(
                z.object({ r: z.discriminatedUnion('t', [A, B]) }),
            ),
        ).toThrow(
            /\$\.properties\.r\.oneOf — almost certainly a z\.discriminatedUnion/,
        );
    });
    it('accepts the z.union equivalent', () => {
        expect(() =>
            assertStrictModeSafe(z.object({ r: z.union([A, B]) })),
        ).not.toThrow();
    });
    it('finds it nested in an array', () => {
        expect(() =>
            assertStrictModeSafe(
                z.object({ r: z.array(z.discriminatedUnion('t', [A, B])) }),
            ),
        ).toThrow(/oneOf/);
    });
    it('accepts properties named like the keywords', () => {
        const schema = z.object({
            oneOf: z.string(),
            allOf: z.number(),
            not: z.boolean(),
        });
        expect(() => assertStrictModeSafe(schema)).not.toThrow();
    });
    it('throws on every call, not only the first', () => {
        const schema = z.object({ r: z.discriminatedUnion('t', [A, B]) });
        expect(() => assertStrictModeSafe(schema)).toThrow(/oneOf/);
        expect(() => assertStrictModeSafe(schema)).toThrow(/oneOf/);
    });
    it('checks the input side the provider is sent, so transforms pass', () => {
        const schema = z.object({ s: z.string().transform((s) => s.trim()) });
        expect(() => assertStrictModeSafe(schema)).not.toThrow();
    });
    it('rejects intersection and never', () => {
        expect(() =>
            assertStrictModeSafe(
                z.object({
                    a: z.intersection(
                        z.object({ x: z.string() }),
                        z.object({ y: z.string() }),
                    ),
                }),
            ),
        ).toThrow(/allOf/);
        expect(() => assertStrictModeSafe(z.object({ n: z.never() }))).toThrow(
            /not/,
        );
    });
});
