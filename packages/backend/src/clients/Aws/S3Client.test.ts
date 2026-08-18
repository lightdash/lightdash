import { Readable } from 'stream';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { S3Client } from './S3Client';

const createClient = (sendResponse: unknown) => {
    const client = new S3Client({ lightdashConfig: lightdashConfigMock });
    // @ts-expect-error `s3` is protected; swapped for a stub to avoid network I/O
    client.s3 = { send: vi.fn(async () => sendResponse) };
    return client;
};

describe('S3Client', () => {
    describe('getFileStream', () => {
        it('returns the content disposition stored on the object', async () => {
            const client = createClient({
                Body: Readable.from(['hello,world\n']),
                ContentDisposition:
                    'attachment; filename="My Chart.csv"; filename*=UTF-8\'\'My%20Chart.csv',
            });

            const result = await client.getFileStream('csv-my-chart-123.csv');

            expect(result.contentDisposition).toBe(
                'attachment; filename="My Chart.csv"; filename*=UTF-8\'\'My%20Chart.csv',
            );
            expect(result.stream).toBeInstanceOf(Readable);
        });

        it('returns null when the object has no content disposition', async () => {
            const client = createClient({
                Body: Readable.from(['hello,world\n']),
            });

            const result = await client.getFileStream('csv-my-chart-123.csv');

            expect(result.contentDisposition).toBeNull();
        });

        it('preserves a non-ASCII content disposition verbatim', async () => {
            const client = createClient({
                Body: Readable.from(['hello,world\n']),
                ContentDisposition:
                    'attachment; filename="download.csv"; filename*=UTF-8\'\'%E5%A3%B2%E4%B8%8A.csv',
            });

            const result = await client.getFileStream('csv-123.csv');

            expect(result.contentDisposition).toBe(
                'attachment; filename="download.csv"; filename*=UTF-8\'\'%E5%A3%B2%E4%B8%8A.csv',
            );
        });
    });
});
