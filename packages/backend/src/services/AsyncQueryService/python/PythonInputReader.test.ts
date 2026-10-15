import { PassThrough } from 'stream';
import { ChecksumStreamStandIn } from '../../../clients/Aws/s3Streams.testUtils';
import { PythonInputReader } from './PythonInputReader';

describe('PythonInputReader', () => {
    it('abort closes the HTTP response behind a checksum-wrapped input', async () => {
        const response = new PassThrough();
        const body = new ChecksumStreamStandIn(response);
        response.write('{"n":1}\n');
        const reader = new PythonInputReader();
        const pending = reader.read(body);

        reader.abort(new Error('sibling input failed'));

        await expect(pending).rejects.toThrow('sibling input failed');
        expect(response.destroyed).toBe(true);
    });

    it('closes the HTTP response of an input that arrives after a failure', async () => {
        const response = new PassThrough();
        const body = new ChecksumStreamStandIn(response);
        const reader = new PythonInputReader();
        reader.abort(new Error('earlier failure'));

        await expect(reader.read(body)).rejects.toThrow('earlier failure');

        expect(response.destroyed).toBe(true);
    });
});
