import {
    CappedOutput,
    MAX_CAPTURED_OUTPUT_BYTES,
    capOutput,
} from './commandOutput';

describe('commandOutput cap', () => {
    describe('CappedOutput', () => {
        it('passes small output through unchanged', () => {
            const out = new CappedOutput(1024);
            out.append('hello ');
            out.append(Buffer.from('world'));
            expect(out.isTruncated).toBe(false);
            expect(out.toString()).toBe('hello world');
        });

        it('caps accumulated output and appends a truncation marker', () => {
            const out = new CappedOutput(10);
            out.append('abcdefg');
            out.append('hijklmnop'); // pushes past the 10-byte cap
            expect(out.isTruncated).toBe(true);
            const text = out.toString();
            expect(text.startsWith('abcdefghij')).toBe(true);
            expect(text).toContain('output truncated');
            // Only the first 10 bytes are retained before the marker.
            expect(text.split('\n')[0]).toBe('abcdefghij');
        });

        it('drops entire chunks once the cap is exhausted', () => {
            const out = new CappedOutput(4);
            out.append('abcd');
            out.append('efgh');
            expect(out.isTruncated).toBe(true);
            expect(out.toString().split('\n')[0]).toBe('abcd');
        });

        it('defaults to the shared 10 MB cap', () => {
            const out = new CappedOutput();
            out.append('x'.repeat(MAX_CAPTURED_OUTPUT_BYTES + 5));
            expect(out.isTruncated).toBe(true);
            expect(Buffer.byteLength(out.toString().split('\n')[0])).toBe(
                MAX_CAPTURED_OUTPUT_BYTES,
            );
        });
    });

    describe('capOutput', () => {
        it('returns short strings unchanged', () => {
            expect(capOutput('ok', 1024)).toBe('ok');
        });

        it('truncates long strings and marks them', () => {
            const result = capOutput('abcdefghij', 4);
            expect(result.startsWith('abcd')).toBe(true);
            expect(result).toContain('output truncated');
        });
    });
});
