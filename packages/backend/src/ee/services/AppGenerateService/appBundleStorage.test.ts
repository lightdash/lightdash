import { type S3Config } from '../../../config/parseConfig';
import {
    appVersionAssetKey,
    appVersionIndexHtmlKey,
    getBundleServableChecker,
} from './appBundleStorage';

const s3Mocks = vi.hoisted(() => {
    class FakeS3ServiceException extends Error {
        $metadata: { httpStatusCode?: number } = {};
    }
    const send = vi.fn();
    const createClient = vi.fn();
    class FakeS3Client {
        send = send;

        constructor(config: unknown) {
            createClient(config);
        }
    }
    return {
        send,
        createClient,
        warn: vi.fn(),
        FakeS3ServiceException,
        FakeS3Client,
    };
});

vi.mock('@aws-sdk/client-s3', () => ({
    HeadObjectCommand: class {
        constructor(public readonly input: unknown) {}
    },
    S3ServiceException: s3Mocks.FakeS3ServiceException,
    S3Client: s3Mocks.FakeS3Client,
}));

vi.mock('../../../clients/Aws/S3BaseClient', () => ({
    resolveS3Credentials: vi.fn(() => undefined),
}));

vi.mock('../../../logging/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), warn: s3Mocks.warn, error: vi.fn() },
}));

// A fresh object per call: the module memoises its client per config identity.
const makeS3Config = (): S3Config =>
    ({
        region: 'eu-west-1',
        endpoint: '',
        bucket: 'app-bundles',
    }) as S3Config;

const s3Error = (name: string, httpStatusCode: number) => {
    const error = new s3Mocks.FakeS3ServiceException(name);
    error.name = name;
    error.$metadata = { httpStatusCode };
    return error;
};

describe('appVersionIndexHtmlKey / appVersionAssetKey', () => {
    it('build the keys the preview router serves', () => {
        expect(appVersionIndexHtmlKey('app-1', 2)).toBe(
            'apps/app-1/versions/2/index.html',
        );
        expect(appVersionAssetKey('app-1', 2, 'main.js')).toBe(
            'apps/app-1/versions/2/assets/main.js',
        );
    });
});

describe('getBundleServableChecker', () => {
    beforeEach(() => {
        s3Mocks.send.mockReset();
        s3Mocks.warn.mockReset();
        s3Mocks.createClient.mockReset();
    });

    it('heads the version index document', async () => {
        s3Mocks.send.mockResolvedValue({});

        await expect(
            getBundleServableChecker(makeS3Config())('app-1', 2),
        ).resolves.toBe(true);
        expect(s3Mocks.send).toHaveBeenCalledWith(
            expect.objectContaining({
                input: {
                    Bucket: 'app-bundles',
                    Key: appVersionIndexHtmlKey('app-1', 2),
                },
            }),
        );
    });

    it.each(['NotFound', 'NoSuchKey'])(
        'reports a missing bundle as unservable on %s, and logs it',
        async (name) => {
            s3Mocks.send.mockRejectedValue(s3Error(name, 404));

            await expect(
                getBundleServableChecker(makeS3Config())('app-1', 2),
            ).resolves.toBe(false);
            expect(s3Mocks.warn).toHaveBeenCalledWith(
                expect.stringContaining('App bundle missing'),
            );
        },
    );

    // A missing bucket is also a 404, and a missing key is a 403 without
    // `s3:ListBucket`; treating either as "gone" would blank every preview.
    it.each([
        ['NoSuchBucket', 404],
        ['AccessDenied', 403],
        ['SlowDown', 503],
    ])('fails open on %s', async (name, status) => {
        s3Mocks.send.mockRejectedValue(s3Error(name, status));

        await expect(
            getBundleServableChecker(makeS3Config())('app-1', 2),
        ).resolves.toBe(true);
    });

    it('fails open when the check itself errors', async () => {
        s3Mocks.send.mockRejectedValue(new Error('connection reset'));

        await expect(
            getBundleServableChecker(makeS3Config())('app-1', 2),
        ).resolves.toBe(true);
    });

    it('fails open when building the client throws', async () => {
        s3Mocks.createClient.mockImplementation(() => {
            throw new Error('no credential provider');
        });

        await expect(
            getBundleServableChecker(makeS3Config())('app-1', 2),
        ).resolves.toBe(true);
    });

    it('fails open without contacting storage when none is configured', async () => {
        await expect(getBundleServableChecker(null)('app-1', 2)).resolves.toBe(
            true,
        );
        expect(s3Mocks.send).not.toHaveBeenCalled();
    });

    // The result is not cached on purpose: a bundle disappearing is the case
    // this check exists for, so a confirmed hit must never go stale.
    it('heads storage on every call, so a purge is noticed immediately', async () => {
        s3Mocks.send.mockResolvedValue({});
        const check = getBundleServableChecker(makeS3Config());

        await expect(check('app-1', 2)).resolves.toBe(true);

        s3Mocks.send.mockRejectedValue(s3Error('NotFound', 404));

        await expect(check('app-1', 2)).resolves.toBe(false);
        expect(s3Mocks.send).toHaveBeenCalledTimes(2);
    });

    it('builds one client per config object', async () => {
        s3Mocks.send.mockResolvedValue({});
        const config = makeS3Config();

        await getBundleServableChecker(config)('app-1', 2);
        await getBundleServableChecker(config)('app-1', 3);

        expect(s3Mocks.createClient).toHaveBeenCalledTimes(1);
    });
});
