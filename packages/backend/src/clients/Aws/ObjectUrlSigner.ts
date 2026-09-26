import { GetObjectCommand, type S3, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { type Storage } from '@google-cloud/storage';
import { type S3ConnectionConfig } from './S3BaseClient';

/** The expiry that `@aws-sdk/s3-request-presigner` applies when a caller gives none. */
const DEFAULT_EXPIRES_IN_SECONDS = 900;

/**
 * Creates a URL that grants time-limited access to an object in a bucket.
 *
 * S3 and GCS sign URLs in incompatible ways, so each storage backend provides
 * its own implementation. This interface covers downloads only, because
 * callers set Content-Disposition when they upload an object rather than when
 * they sign a URL.
 */
export interface ObjectUrlSigner {
    getSignedDownloadUrl(
        bucket: string,
        key: string,
        expiresInSeconds?: number,
    ): Promise<string>;
}

/** Signs URLs with SigV4 through the AWS SDK. Use this class with S3, RustFS, or GCS HMAC keys. */
export class S3PresignerUrlSigner implements ObjectUrlSigner {
    private readonly client: S3 | S3Client;

    constructor(client: S3 | S3Client) {
        this.client = client;
    }

    async getSignedDownloadUrl(
        bucket: string,
        key: string,
        expiresInSeconds?: number,
    ): Promise<string> {
        return getSignedUrl(
            this.client,
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            { expiresIn: expiresInSeconds },
        );
    }
}

/**
 * One Storage instance per process. The import runs on first use, so a
 * deployment that never signs a GCS URL never loads the library.
 */
let gcsStoragePromise: Promise<Storage> | undefined;

async function getGcsStorage(): Promise<Storage> {
    gcsStoragePromise ??= import('@google-cloud/storage').then(
        ({ Storage }) => new Storage(),
    );
    return gcsStoragePromise;
}

/**
 * Signs URLs through Google. The library sends the string to sign to the
 * `signBlob` API, and Google signs it with a key that Google holds. A service
 * account can therefore sign a URL without ever holding a private key, which
 * is what makes workload identity work.
 *
 * The service account needs the `roles/iam.serviceAccountTokenCreator` role on
 * itself. If it lacks that role, every other operation still succeeds and only
 * signed URLs fail, with the error
 * `Permission 'iam.serviceAccounts.signBlob' denied on resource`.
 */
export class GcsUrlSigner implements ObjectUrlSigner {
    async getSignedDownloadUrl(
        bucket: string,
        key: string,
        expiresInSeconds: number = DEFAULT_EXPIRES_IN_SECONDS,
    ): Promise<string> {
        const storage = await getGcsStorage();
        const [url] = await storage
            .bucket(bucket)
            .file(key)
            .getSignedUrl({
                // Set the version explicitly. The library defaults to the
                // obsolete v2 algorithm and reports no error when it creates
                // a v2 URL.
                version: 'v4',
                action: 'read',
                expires: Date.now() + expiresInSeconds * 1000,
            });
        return url;
    }
}

/** Returns the signing implementation for the configured authentication mode. */
export function createObjectUrlSigner(
    client: S3 | S3Client,
    config: Pick<S3ConnectionConfig, 'authMode'>,
): ObjectUrlSigner {
    return config.authMode === 'gcp_oauth'
        ? new GcsUrlSigner()
        : new S3PresignerUrlSigner(client);
}
