import {
    CopyObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { HttpResponse, type HttpRequest } from '@smithy/protocol-http';
import { applyGcpOAuth } from './gcpOAuth';
import { buildS3ClientConfig } from './S3BaseClient';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const gcpMocks = vi.hoisted(() => ({
    getAccessToken: vi.fn(async () => 'test-access-token'),
}));

vi.mock('google-auth-library', () => ({
    GoogleAuth: class {
        // eslint-disable-next-line class-methods-use-this
        async getClient() {
            return { getAccessToken: gcpMocks.getAccessToken };
        }
    },
}));

/** Records the request that the SDK would send, and sends nothing. */
const createCapturingRequestHandler = () => {
    const requests: HttpRequest[] = [];
    return {
        requests,
        handler: {
            handle: async (request: HttpRequest) => {
                requests.push(request);
                return {
                    response: new HttpResponse({
                        statusCode: 200,
                        headers: { etag: '"an-etag"' },
                    }),
                };
            },
            updateHttpClientConfig: () => {},
            httpHandlerConfigs: () => ({}),
        },
    };
};

describe('gcp_oauth request authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gcpMocks.getAccessToken.mockResolvedValue('test-access-token');
    });

    /**
     * The `signer` option predates the authentication scheme system in version
     * 3 of the AWS SDK. If a future SDK release stops reading that option,
     * SigV4 signs the request again and GCS rejects every call. No other test
     * detects this change, so read this test before you upgrade
     * @aws-sdk/client-s3.
     */
    it('sends a bearer token and no SigV4 headers', async () => {
        const { requests, handler } = createCapturingRequestHandler();
        const client = new S3Client({
            ...buildS3ClientConfig({
                region: 'auto',
                endpoint: 'https://storage.googleapis.com',
                forcePathStyle: true,
                authMode: 'gcp_oauth',
            }),
            requestHandler: handler,
        });
        applyGcpOAuth(client);

        await client.send(
            new PutObjectCommand({
                Bucket: 'a-bucket',
                Key: 'a-key',
                Body: 'some content',
            }),
        );

        expect(requests).toHaveLength(1);
        const headers = Object.fromEntries(
            Object.entries(requests[0].headers).map(([name, value]) => [
                name.toLowerCase(),
                value,
            ]),
        );
        expect(headers.authorization).toEqual('Bearer test-access-token');
        expect(headers.authorization).not.toContain('AWS4-HMAC-SHA256');
        expect(headers['x-amz-date']).toBeUndefined();
        expect(headers['x-amz-content-sha256']).toBeUndefined();
    });

    /**
     * GCS only honors `x-amz-*` headers on requests signed with HMAC interop
     * credentials. With a bearer token it expects the `x-goog-*` spelling, so
     * an untranslated CopyObject arrives without a copy source and GCS
     * rejects it with `InvalidArgument: Missing copy source`.
     */
    it('translates the copy source header so GCS accepts CopyObject', async () => {
        const { requests, handler } = createCapturingRequestHandler();
        const client = new S3Client({
            ...buildS3ClientConfig({
                region: 'auto',
                endpoint: 'https://storage.googleapis.com',
                forcePathStyle: true,
                authMode: 'gcp_oauth',
            }),
            requestHandler: handler,
        });
        applyGcpOAuth(client);

        await client.send(
            new CopyObjectCommand({
                Bucket: 'a-bucket',
                CopySource: '/a-bucket/source-key',
                Key: 'destination-key',
            }),
        );

        expect(requests).toHaveLength(1);
        const headers = Object.fromEntries(
            Object.entries(requests[0].headers).map(([name, value]) => [
                name.toLowerCase(),
                value,
            ]),
        );
        expect(headers['x-goog-copy-source']).toEqual('/a-bucket/source-key');
        expect(headers['x-amz-copy-source']).toBeUndefined();
    });

    it('translates conditional copy headers alongside the copy source', async () => {
        const { requests, handler } = createCapturingRequestHandler();
        const client = new S3Client({
            ...buildS3ClientConfig({
                region: 'auto',
                endpoint: 'https://storage.googleapis.com',
                forcePathStyle: true,
                authMode: 'gcp_oauth',
            }),
            requestHandler: handler,
        });
        applyGcpOAuth(client);

        await client.send(
            new CopyObjectCommand({
                Bucket: 'a-bucket',
                CopySource: '/a-bucket/source-key',
                Key: 'destination-key',
                CopySourceIfMatch: '"an-etag"',
                MetadataDirective: 'COPY',
            }),
        );

        expect(requests).toHaveLength(1);
        const headers = Object.fromEntries(
            Object.entries(requests[0].headers).map(([name, value]) => [
                name.toLowerCase(),
                value,
            ]),
        );
        expect(headers['x-goog-copy-source-if-match']).toEqual('"an-etag"');
        expect(headers['x-goog-metadata-directive']).toEqual('COPY');
        expect(headers['x-amz-copy-source-if-match']).toBeUndefined();
        expect(headers['x-amz-metadata-directive']).toBeUndefined();
    });

    it('asks for a token on every request so long uploads survive expiry', async () => {
        const { handler } = createCapturingRequestHandler();
        const client = new S3Client({
            ...buildS3ClientConfig({
                region: 'auto',
                endpoint: 'https://storage.googleapis.com',
                authMode: 'gcp_oauth',
            }),
            requestHandler: handler,
        });
        applyGcpOAuth(client);

        const command = () =>
            new PutObjectCommand({
                Bucket: 'a-bucket',
                Key: 'a-key',
                Body: 'some content',
            });
        await client.send(command());
        await client.send(command());

        expect(gcpMocks.getAccessToken).toHaveBeenCalledTimes(2);
    });
});
