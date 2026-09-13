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
    it('scrubs secrets, numbers chunks in order, and setSecrets replaces the list', async () => {
        const sink = collect();
        const buf = new OutputBuffer({
            secrets: ['ldpat_secret'],
            flushBytes: 4,
            onFlush: sink.onFlush,
        });
        buf.push('stdout', 'token ldpat_secret ok\n');
        buf.setSecrets(['ldpat_new']);
        buf.push('stderr', 'old ldpat_secret new ldpat_new value\n');
        await buf.close();
        expect(sink.chunks.map((c) => c.seq)).toEqual([1, 2]);
        expect(sink.chunks[0]).toEqual({
            seq: 1,
            stream: 'stdout',
            text: 'token *** ok\n',
        });
        // Proves replacement, not addition: the original secret set via the
        // constructor is no longer scrubbed once setSecrets replaces it, while
        // the newly-set secret is.
        expect(sink.chunks[1]).toEqual({
            seq: 2,
            stream: 'stderr',
            text: 'old ldpat_secret new *** value\n',
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
    it('keeps flushing after onFlush rejects and exposes the error', async () => {
        const delivered: { seq: number; stream: string; text: string }[] = [];
        let calls = 0;
        const onFlush = async (
            batch: { seq: number; stream: string; text: string }[],
        ) => {
            calls += 1;
            if (calls === 1) {
                throw new Error('boom');
            }
            delivered.push(...batch);
        };
        const buf = new OutputBuffer({ secrets: [], flushBytes: 4, onFlush });
        buf.push('stdout', 'first\n');
        buf.push('stdout', 'second\n');
        await buf.close();
        expect(calls).toBe(2);
        expect(delivered).toHaveLength(1);
        expect(delivered[0].text).toBe('second\n');
        expect(buf.error).toBeInstanceOf(Error);
        expect((buf.error as Error).message).toBe('boom');
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
