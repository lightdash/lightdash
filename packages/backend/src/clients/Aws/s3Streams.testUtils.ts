import { Duplex, type Readable } from 'stream';

/**
 * Mirrors `ChecksumStream` from `@smithy/util-stream` 4.5.15, which the AWS
 * SDK puts around a GetObject body whenever the response carries an
 * `x-amz-checksum-*` header: a Duplex fed by `source.pipe(this)` with no
 * `_destroy` override. Destroying it only unpipes, so the HTTP response
 * underneath stays open and paused.
 */
export class ChecksumStreamStandIn extends Duplex {
    readonly source: Readable;

    private pendingCallback: (() => void) | null = null;

    constructor(source: Readable) {
        super();
        this.source = source;
        this.source.pipe(this);
    }

    // eslint-disable-next-line no-underscore-dangle
    _read() {
        const callback = this.pendingCallback;
        if (callback) {
            this.pendingCallback = null;
            callback();
        }
    }

    // eslint-disable-next-line no-underscore-dangle
    _write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ) {
        if (!this.push(chunk)) {
            this.pendingCallback = callback;
            return;
        }
        callback();
    }

    // eslint-disable-next-line no-underscore-dangle
    _final(callback: (error?: Error | null) => void) {
        this.push(null);
        callback();
    }
}
