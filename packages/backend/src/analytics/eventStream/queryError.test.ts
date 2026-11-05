import { truncateQueryError } from './queryError';

describe('analytics query error limit', () => {
    it.each([
        null,
        undefined,
        '',
        'short error',
        'x'.repeat(1000),
        '😀'.repeat(1000),
    ])('preserves absent and in-limit messages (%#)', (message) => {
        expect(truncateQueryError(message)).toBe(message ?? null);
    });

    it.each(['x'.repeat(1001), '😀'.repeat(1001), 'x'.repeat(1_000_000)])(
        'bounds oversized messages including the marker (%#)',
        (message) => {
            const result = truncateQueryError(message)!;
            expect(Array.from(result)).toHaveLength(1000);
            expect(result.endsWith('… [truncated]')).toBe(true);
            expect(result).toBe(
                `${Array.from(message).slice(0, 987).join('')}… [truncated]`,
            );
        },
    );
});
