import { expectTypeOf } from 'vitest';
import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from './outputMetadata';

const successContent = z.object({ rowCount: z.number() });

const outputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: successContent,
});

type ToolOutput = z.infer<typeof outputSchema>;

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

    it('rejects mismatched status and structured content', () => {
        expect(
            outputSchema.safeParse({
                result: 'Error running the tool.',
                metadata: { status: 'success' },
                structuredContent: { error: 'Error running the tool.' },
            }).success,
        ).toBe(false);
        expect(
            outputSchema.safeParse({
                result: 'text',
                metadata: { status: 'error' },
                structuredContent: { rowCount: 2 },
            }).success,
        ).toBe(false);

        expectTypeOf<{
            result: string;
            metadata: { status: 'success' };
            structuredContent: { error: string };
        }>().not.toExtend<ToolOutput>();
        expectTypeOf<{
            result: string;
            metadata: { status: 'error' };
            structuredContent: { rowCount: number };
        }>().not.toExtend<ToolOutput>();
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
                z.object({ status: z.literal('pending'), uuid: z.string() }),
                z.object({ status: z.literal('error') }),
            ]),
            structuredContent: successContent,
            contentStatuses: z.enum(['success', 'pending']),
        });

        expect(
            schema.safeParse({
                result: 'text',
                metadata: { status: 'success', uuid: 'chart-1' },
                structuredContent: { rowCount: 1 },
            }).success,
        ).toBe(true);
        expect(
            schema.safeParse({
                result: 'In progress',
                metadata: { status: 'pending', uuid: 'chart-1' },
                structuredContent: { rowCount: 0 },
            }).success,
        ).toBe(true);
        expect(
            schema.safeParse({
                result: 'In progress',
                metadata: { status: 'pending', uuid: 'chart-1' },
                structuredContent: { error: 'failed' },
            }).success,
        ).toBe(false);
        expectTypeOf<{
            result: string;
            metadata: { status: 'pending'; uuid: string };
            structuredContent: { rowCount: number };
        }>().toExtend<z.infer<typeof schema>>();
    });

    it('uses the declared error statuses for a tool', () => {
        const schema = structuredToolOutputSchema({
            metadata: z.object({
                status: z.enum(['success', 'error', 'rejected', 'timeout']),
            }),
            structuredContent: successContent,
            errorStatuses: z.enum(['error', 'rejected', 'timeout']),
        });

        expect(
            schema.safeParse({
                result: 'Approval rejected',
                metadata: { status: 'rejected' },
                structuredContent: { error: 'Approval rejected' },
            }).success,
        ).toBe(true);
        expect(
            schema.safeParse({
                result: 'Approval timed out',
                metadata: { status: 'timeout' },
                structuredContent: { error: 'Approval timed out' },
            }).success,
        ).toBe(true);
        expect(
            schema.safeParse({
                result: 'Approval rejected',
                metadata: { status: 'rejected' },
                structuredContent: { rowCount: 2 },
            }).success,
        ).toBe(false);
        expectTypeOf<{
            result: string;
            metadata: { status: 'rejected' };
            structuredContent: { rowCount: number };
        }>().not.toExtend<z.infer<typeof schema>>();
    });

    it('allows a tool-specific non-error status with normal content', () => {
        const schema = structuredToolOutputSchema({
            metadata: z.object({
                status: z.enum(['success', 'not_found', 'error']),
            }),
            structuredContent: successContent,
            contentStatuses: z.enum(['success', 'not_found']),
        });

        expect(
            schema.safeParse({
                result: 'No columns found',
                metadata: { status: 'not_found' },
                structuredContent: { rowCount: 0 },
            }).success,
        ).toBe(true);
        expect(
            schema.safeParse({
                result: 'No columns found',
                metadata: { status: 'not_found' },
                structuredContent: { error: 'No columns found' },
            }).success,
        ).toBe(false);
    });

    it('rejects overlapping content and error statuses', () => {
        expect(() =>
            structuredToolOutputSchema({
                metadata: baseOutputMetadataSchema,
                structuredContent: successContent,
                errorStatuses: z.enum(['success', 'error']),
            }),
        ).toThrow('Tool output content and error statuses must be disjoint');
    });
});
