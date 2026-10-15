import { ParameterError } from '@lightdash/common';
import { Readable } from 'stream';

type SandboxInputReaderOptions = {
    maxBytes: number;
    limitMessage: string;
};

/** Shares one byte budget and cancellation state across a query's input streams. */
export class SandboxInputReader {
    private readonly streams = new Set<Readable>();

    private remainingBytes: number;

    private failure: Error | null = null;

    private readonly limitMessage: string;

    constructor({ maxBytes, limitMessage }: SandboxInputReaderOptions) {
        this.remainingBytes = maxBytes;
        this.limitMessage = limitMessage;
    }

    abort(error: unknown): void {
        this.failure ??=
            error instanceof Error ? error : new Error(String(error));
        this.streams.forEach((stream) => stream.destroy());
    }

    async read(stream: Readable): Promise<Buffer> {
        if (this.failure) {
            stream.destroy();
            throw this.failure;
        }
        this.streams.add(stream);
        const chunks: Buffer[] = [];
        try {
            for await (const chunk of stream) {
                if (this.failure) throw this.failure;
                const bytes =
                    typeof chunk === 'string'
                        ? Buffer.byteLength(chunk, 'utf8')
                        : chunk.length;
                if (bytes > this.remainingBytes) {
                    throw new ParameterError(this.limitMessage);
                }
                this.remainingBytes -= bytes;
                chunks.push(
                    typeof chunk === 'string'
                        ? Buffer.from(chunk, 'utf8')
                        : chunk,
                );
            }
            if (this.failure) throw this.failure;
            return Buffer.concat(chunks);
        } catch (error) {
            this.abort(error);
            throw this.failure;
        } finally {
            this.streams.delete(stream);
        }
    }
}
