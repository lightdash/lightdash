import { PassThrough } from 'stream';
import { destroyS3Body } from './s3Streams';
import { ChecksumStreamStandIn } from './s3Streams.testUtils';

describe('destroyS3Body', () => {
    it('destroys the HTTP response behind an SDK checksum wrapper', () => {
        const response = new PassThrough();
        const body = new ChecksumStreamStandIn(response);
        response.write('still streaming');

        destroyS3Body(body);

        expect(body.destroyed).toBe(true);
        expect(response.destroyed).toBe(true);
    });

    it('destroys a plain body', () => {
        const body = new PassThrough();

        destroyS3Body(body);

        expect(body.destroyed).toBe(true);
    });

    it('passes the error to both streams', async () => {
        const response = new PassThrough();
        const body = new ChecksumStreamStandIn(response);
        const errors: unknown[] = [];
        body.on('error', (e) => errors.push(e));
        response.on('error', (e) => errors.push(e));
        const error = new Error('cancelled');

        destroyS3Body(body, error);
        // destroy() emits 'error' on the next tick
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        expect(errors).toEqual([error, error]);
    });
});
