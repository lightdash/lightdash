import { DeleteObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AppRuntimeThumbnailStorage } from './AppThumbnailClient';

const sent: unknown[] = [];
let respond: () => Promise<unknown> = async () => ({});

vi.mock('../services/AppGenerateService/s3Utils', () => ({
    createAppRuntimeS3: () => ({
        client: {
            send: (command: unknown) => {
                sent.push(command);
                return respond();
            },
        },
        bucket: 'apps',
    }),
}));

const s3Error = (httpStatusCode: number, name: string) =>
    new S3ServiceException({
        name,
        $fault: 'client',
        $metadata: { httpStatusCode },
    });

const KEY = 'apps/a/thumbnails/1/automatic.png';

describe('AppRuntimeThumbnailStorage.delete', () => {
    beforeEach(() => {
        sent.length = 0;
        respond = async () => ({});
    });

    it('deletes the object', async () => {
        const storage = new AppRuntimeThumbnailStorage({
            lightdashConfig: lightdashConfigMock,
        });

        await storage.delete(KEY);

        expect(sent).toEqual([expect.any(DeleteObjectCommand)]);
    });

    it('succeeds when the object does not exist', async () => {
        respond = () => Promise.reject(s3Error(404, 'NoSuchKey'));
        const storage = new AppRuntimeThumbnailStorage({
            lightdashConfig: lightdashConfigMock,
        });

        await expect(storage.delete(KEY)).resolves.toBeUndefined();
    });

    it('rethrows other storage errors', async () => {
        respond = () => Promise.reject(s3Error(403, 'AccessDenied'));
        const storage = new AppRuntimeThumbnailStorage({
            lightdashConfig: lightdashConfigMock,
        });

        await expect(storage.delete(KEY)).rejects.toMatchObject({
            name: 'AccessDenied',
        });
    });
});
