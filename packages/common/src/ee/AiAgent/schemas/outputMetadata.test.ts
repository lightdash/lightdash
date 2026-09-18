import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    persistedToolOutputSchema,
    structuredToolOutputSchema,
} from './outputMetadata';

const successContent = z.object({ rowCount: z.number() });

const outputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: successContent,
});

describe('structuredToolOutputSchema', () => {
    it('requires structuredContent on a tool result', () => {
        expect(
            outputSchema.safeParse({
                result: 'text',
                metadata: { status: 'success' },
            }).success,
        ).toBe(false);

        expect(
            outputSchema.safeParse({
                result: 'text',
                metadata: { status: 'success' },
                structuredContent: { rowCount: 2 },
            }).success,
        ).toBe(true);
    });

    it('accepts the shared error shape on a failed call', () => {
        expect(
            outputSchema.safeParse({
                result: 'Error running the tool.',
                metadata: { status: 'error' },
                structuredContent: { error: 'Error running the tool.' },
            }).success,
        ).toBe(true);
    });

    it('rejects structured content that matches neither shape', () => {
        expect(
            outputSchema.safeParse({
                result: 'text',
                metadata: { status: 'success' },
                structuredContent: { rows: 2 },
            }).success,
        ).toBe(false);
    });

    it('accepts a discriminated union as metadata', () => {
        const schema = structuredToolOutputSchema({
            metadata: z.discriminatedUnion('status', [
                z.object({ status: z.literal('success'), uuid: z.string() }),
                z.object({ status: z.literal('error') }),
            ]),
            structuredContent: successContent,
        });

        expect(
            schema.safeParse({
                result: 'text',
                metadata: { status: 'success', uuid: 'chart-1' },
                structuredContent: { rowCount: 1 },
            }).success,
        ).toBe(true);
    });
});

describe('persistedToolOutputSchema', () => {
    // Tool results are stored as text + metadata, so a row written before a
    // tool gained structured content must still read back.
    it('accepts a stored result without structured content', () => {
        expect(
            persistedToolOutputSchema(outputSchema).safeParse({
                result: 'text',
                metadata: { status: 'success' },
            }).success,
        ).toBe(true);
    });

    it('still validates structured content when it is present', () => {
        const schema = persistedToolOutputSchema(outputSchema);

        expect(
            schema.safeParse({
                result: 'text',
                metadata: { status: 'success' },
                structuredContent: { rowCount: 3 },
            }).success,
        ).toBe(true);
        expect(
            schema.safeParse({
                result: 'text',
                metadata: { status: 'success' },
                structuredContent: { rows: 3 },
            }).success,
        ).toBe(false);
    });
});
