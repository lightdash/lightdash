import { normalizeToolOutput } from './agentV2';

describe('normalizeToolOutput', () => {
    it('preserves built-in tool output result and metadata', () => {
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
