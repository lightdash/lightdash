import { normalizeToolOutput } from './normalizeToolOutput';

describe('normalizeToolOutput', () => {
    it('serializes string tool output and preserves metadata', () => {
        expect(
            normalizeToolOutput({
                status: 'success',
                type: 'string',
                result: 'ok',
                metadata: { status: 'success' },
            }),
        ).toEqual({
            result: 'ok',
            metadata: { status: 'success' },
        });
    });

    it('serializes json tool output as pretty JSON and preserves metadata', () => {
        expect(
            normalizeToolOutput({
                status: 'success',
                type: 'json',
                result: { count: 1 },
                metadata: { status: 'success', ranking: { searchQuery: 'q' } },
            }),
        ).toEqual({
            result: JSON.stringify({ count: 1 }, null, 2),
            metadata: { status: 'success', ranking: { searchQuery: 'q' } },
        });
    });

    it('stores the error text and metadata for error tool output', () => {
        expect(
            normalizeToolOutput({
                status: 'error',
                error: 'The change could not be made',
                metadata: {
                    status: 'error',
                    errorCode: 'repo_write_forbidden',
                },
            }),
        ).toEqual({
            result: 'The change could not be made',
            metadata: { status: 'error', errorCode: 'repo_write_forbidden' },
        });
    });

    it('joins array tool output and keeps the first defined metadata', () => {
        expect(
            normalizeToolOutput([
                { status: 'success', type: 'string', result: 'first' },
                {
                    status: 'success',
                    type: 'string',
                    result: 'second',
                    metadata: { status: 'success', rowCount: 2 },
                },
            ]),
        ).toEqual({
            result: 'first\nsecond',
            metadata: { status: 'success', rowCount: 2 },
        });
    });

    it('preserves legacy `{ result, metadata }` outputs', () => {
        expect(
            normalizeToolOutput({
                result: 'ok',
                metadata: { status: 'success' },
            }),
        ).toEqual({
            result: 'ok',
            metadata: { status: 'success' },
        });
    });

    it('stores plain-text MCP output', () => {
        expect(normalizeToolOutput('plain text')).toEqual({
            result: 'plain text',
        });
    });

    it('stores structured MCP output as JSON text', () => {
        const output = {
            content: [{ type: 'text', text: 'hello' }],
        };

        expect(normalizeToolOutput(output)).toEqual({
            result: JSON.stringify(output),
        });
    });

    it('always returns a string result for empty MCP output', () => {
        expect(normalizeToolOutput(undefined)).toEqual({
            result: 'undefined',
        });
    });
});
