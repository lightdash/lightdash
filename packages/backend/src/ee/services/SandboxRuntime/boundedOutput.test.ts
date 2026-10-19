import { readBoundedStream } from './boundedOutput';
import { SandboxOutputLimitError } from './errors';

describe('readBoundedStream', () => {
    it('accepts exact limits and preserves binary bytes', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([0, 255]));
                controller.enqueue(new Uint8Array([128, 1]));
                controller.close();
            },
        });
        await expect(readBoundedStream(stream, 4)).resolves.toEqual(
            Buffer.from([0, 255, 128, 1]),
        );
    });

    it('cancels a growing stream on the first oversized chunk', async () => {
        const cancel = vi.fn();
        let produced = 0;
        const stream = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    produced += 1;
                    controller.enqueue(new Uint8Array(1024));
                },
                cancel,
            },
            { highWaterMark: 0 },
        );
        await expect(readBoundedStream(stream, 2048)).rejects.toBeInstanceOf(
            SandboxOutputLimitError,
        );
        expect(produced).toBe(3);
        expect(cancel).toHaveBeenCalledOnce();
    });
});
