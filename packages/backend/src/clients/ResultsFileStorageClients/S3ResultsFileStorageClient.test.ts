import { PassThrough } from 'stream';
import type { LightdashConfig } from '../../config/parseConfig';
import { ChecksumStreamStandIn } from '../Aws/s3Streams.testUtils';
import { S3ResultsFileStorageClient } from './S3ResultsFileStorageClient';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const s3Mocks = vi.hoisted(() => {
    const send = vi.fn();
    class FakeS3 {
        middlewareStack = { add: vi.fn() };

        send = send;
    }
    return { send, FakeS3 };
});

vi.mock('@aws-sdk/client-s3', () => ({
    S3: s3Mocks.FakeS3,
    S3Client: s3Mocks.FakeS3,
    GetObjectCommand: class {},
    HeadObjectCommand: class {},
    DeleteObjectCommand: class {},
    PutObjectCommand: class {},
    NoSuchKey: class extends Error {},
    NotFound: class extends Error {},
    S3ServiceException: class extends Error {},
}));

describe('S3ResultsFileStorageClient', () => {
    const lightdashConfig = {
        s3: { expirationTime: 60 },
        results: {
            s3: {
                bucket: 'results',
                endpoint: 'https://s3.example.com',
                region: 'us-east-1',
            },
        },
    } as unknown as LightdashConfig;

    beforeEach(() => {
        s3Mocks.send.mockReset();
    });

    describe('getFirstLine', () => {
        it('closes the HTTP response behind a checksum-wrapped body after reading the first line', async () => {
            // More than one line and no end, like a large results file
            // served by AWS S3 with a checksum header
            const response = new PassThrough();
            const body = new ChecksumStreamStandIn(response);
            response.write('{"first":true}\n{"second":true}\n');
            s3Mocks.send.mockResolvedValue({ Body: body });
            const client = new S3ResultsFileStorageClient({ lightdashConfig });

            const firstLine = await client.getFirstLine('query-results');

            expect(firstLine).toEqual('{"first":true}');
            expect(response.destroyed).toBe(true);
        });
    });
});
