import {
    OUTPUT_HEAD_BYTES,
    OUTPUT_TAIL_BYTES,
    OUTPUT_TRUNCATED_MARKER,
    OutputBuffer,
} from './outputBuffer';

const collect = () => {
    const chunks: { seq: number; stream: string; text: string }[] = [];
    return {
        chunks,
        onFlush: async (c: typeof chunks) => {
            chunks.push(...c);
        },
    };
};

describe('OutputBuffer', () => {
    it('scrubs secrets and numbers chunks in order', async () => {
        const sink = collect();
        const buf = new OutputBuffer({
            secrets: ['ldpat_secret'],
            flushBytes: 4,
            onFlush: sink.onFlush,
        });
        buf.push('stdout', 'token ldpat_secret ok\n');
        buf.push('stderr', 'err\n');
        buf.setSecrets(['err']);
        buf.push('stderr', 'another err line\n');
        await buf.close();
        expect(sink.chunks.map((c) => c.seq)).toEqual([1, 2, 3]);
        expect(sink.chunks[0]).toEqual({
            seq: 1,
            stream: 'stdout',
            text: 'token *** ok\n',
        });
        expect(sink.chunks[2]).toEqual({
            seq: 3,
            stream: 'stderr',
            text: 'another *** line\n',
        });
    });
    it('flushes on byte threshold before close', async () => {
        const sink = collect();
        const buf = new OutputBuffer({
            secrets: [],
            flushBytes: 8,
            flushEveryMs: 60_000,
            onFlush: sink.onFlush,
        });
        buf.push('stdout', '0123456789');
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(sink.chunks).toHaveLength(1);
        await buf.close();
    });
    it('keeps head, marker, tail when output exceeds the cap', async () => {
        const sink = collect();
        const buf = new OutputBuffer({
            secrets: [],
            flushBytes: 1024,
            flushEveryMs: 60_000,
            onFlush: sink.onFlush,
        });
        const line = `${'x'.repeat(1023)}\n`;
        for (let i = 0; i < 400; i += 1) buf.push('stdout', line); // 400 KB
        await buf.close();
        const text = sink.chunks.map((c) => c.text).join('');
        const [head, tail] = text.split(OUTPUT_TRUNCATED_MARKER);
        expect(head.length).toBeLessThanOrEqual(OUTPUT_HEAD_BYTES);
        expect(tail.length).toBeLessThanOrEqual(OUTPUT_TAIL_BYTES);
        expect(tail.length).toBeGreaterThan(0);
    });
});
