import { PassThrough, Readable } from 'stream';
import { describe, expect, it } from 'vitest';
import { PythonInputReader } from './PythonInputReader';

describe('PythonInputReader', () => {
    it('accepts input exactly at the byte boundary', async () => {
        const reader = new PythonInputReader(4);
        await expect(
            reader.read(Readable.from([Buffer.from('ab'), Buffer.from('cd')])),
        ).resolves.toEqual(Buffer.from('abcd'));
    });

    it('rejects a chunk before retaining bytes beyond the budget', async () => {
        const reader = new PythonInputReader(4);
        const stream = Readable.from([Buffer.from('abcd'), Buffer.from('e')]);
        await expect(reader.read(stream)).rejects.toThrow(
            'combined size limit',
        );
        expect(stream.destroyed).toBe(true);
    });

    it('counts UTF-8 bytes rather than characters', async () => {
        const reader = new PythonInputReader(1);
        await expect(reader.read(Readable.from(['é']))).rejects.toThrow(
            'combined size limit',
        );
    });

    it('shares the budget across concurrent references', async () => {
        const reader = new PythonInputReader(4);
        const streams = Array.from({ length: 5 }, () =>
            Readable.from([Buffer.from('a')]),
        );
        const results = await Promise.allSettled(
            streams.map((stream) => reader.read(stream)),
        );
        expect(results.some((result) => result.status === 'rejected')).toBe(
            true,
        );
        expect(streams.every((stream) => stream.destroyed)).toBe(true);
    });

    it('accepts concurrent references at the combined boundary and retains their budget', async () => {
        const reader = new PythonInputReader(4);
        await expect(
            Promise.all([
                reader.read(Readable.from([Buffer.from('ab')])),
                reader.read(Readable.from([Buffer.from('cd')])),
            ]),
        ).resolves.toEqual([Buffer.from('ab'), Buffer.from('cd')]);
        await expect(
            reader.read(Readable.from([Buffer.from('e')])),
        ).rejects.toThrow('combined size limit');
    });

    it('cancels a stalled sibling and references that finish opening after overflow', async () => {
        const reader = new PythonInputReader(1);
        const stalled = new PassThrough();
        const settled = Promise.allSettled([
            reader.read(stalled),
            reader.read(Readable.from([Buffer.from('ab')])),
        ]);
        expect(
            (await settled).every((result) => result.status === 'rejected'),
        ).toBe(true);
        expect(stalled.destroyed).toBe(true);
        const late = new PassThrough();
        await expect(reader.read(late)).rejects.toThrow('combined size limit');
        expect(late.destroyed).toBe(true);
    });

    it('cancels sibling downloads when another input fails', async () => {
        const reader = new PythonInputReader(4);
        const stalled = new PassThrough();
        const result = reader.read(stalled);
        const failed = new PassThrough();
        const failedResult = reader.read(failed);
        const settled = Promise.allSettled([result, failedResult]);
        failed.destroy(new Error('Download failed'));
        expect(
            (await settled).every((entry) => entry.status === 'rejected'),
        ).toBe(true);
        expect(stalled.destroyed).toBe(true);
    });
});
