import { Readable } from 'stream';
import { describe, expect, it } from 'vitest';
import { splitJsonlStream } from './streamUtils';

const collect = async (stream: Readable): Promise<string[]> => {
    const lines: string[] = [];
    for await (const line of splitJsonlStream(stream)) {
        lines.push(line);
    }
    return lines;
};

describe('splitJsonlStream', () => {
    it('splits lines on \\n', async () => {
        const lines = await collect(
            Readable.from(['{"a":1}\n{"b":2}\n{"c":3}\n']),
        );
        expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
    });

    it('yields a trailing line without a final newline', async () => {
        const lines = await collect(Readable.from(['{"a":1}\n{"b":2}']));
        expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    });

    it('strips \\r from CRLF line endings', async () => {
        const lines = await collect(Readable.from(['{"a":1}\r\n{"b":2}\r\n']));
        expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    });

    it('does NOT split on U+2028/U+2029 inside JSON string values', async () => {
        // JSON.stringify leaves U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH
        // SEPARATOR) unescaped, so JSONL rows legitimately contain them raw.
        // Node 24's readline treats them as line terminators, which splits
        // rows mid-string and breaks JSON.parse.
        const row1 = JSON.stringify({ comment: 'before\u2028after' });
        const row2 = JSON.stringify({ comment: 'before\u2029after' });
        expect(row1).toContain('\u2028');
        expect(row2).toContain('\u2029');

        const lines = await collect(Readable.from([`${row1}\n${row2}\n`]));
        expect(lines).toEqual([row1, row2]);
        expect(JSON.parse(lines[0])).toEqual({
            comment: 'before\u2028after',
        });
        expect(JSON.parse(lines[1])).toEqual({
            comment: 'before\u2029after',
        });
    });

    it('handles lines spanning multiple chunks', async () => {
        const lines = await collect(
            Readable.from(['{"a":', '1}\n{"b"', ':2}\n']),
        );
        expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    });

    it('handles multi-byte UTF-8 characters split across chunk boundaries', async () => {
        const row = JSON.stringify({ text: 'café \u2028 \u{1f600}' });
        const bytes = Buffer.from(`${row}\n`, 'utf8');
        // split in the middle of the multi-byte sequences
        const chunks = [];
        for (let i = 0; i < bytes.length; i += 3) {
            chunks.push(bytes.subarray(i, i + 3));
        }
        const lines = await collect(Readable.from(chunks));
        expect(lines).toEqual([row]);
    });

    it('handles empty streams', async () => {
        expect(await collect(Readable.from([]))).toEqual([]);
    });

    it('yields empty strings for blank lines so callers can skip them', async () => {
        const lines = await collect(Readable.from(['{"a":1}\n\n{"b":2}\n']));
        expect(lines).toEqual(['{"a":1}', '', '{"b":2}']);
    });

    it('propagates stream errors', async () => {
        const erroring = new Readable({
            read() {
                this.destroy(new Error('boom'));
            },
        });
        await expect(collect(erroring)).rejects.toThrow('boom');
    });
});
