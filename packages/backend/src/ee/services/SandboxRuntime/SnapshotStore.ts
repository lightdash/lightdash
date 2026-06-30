import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    type S3,
} from '@aws-sdk/client-s3';
import { MissingConfigError } from '@lightdash/common';
import { S3BaseClient } from '../../../clients/Aws/S3BaseClient';
import { type LightdashConfig } from '../../../config/parseConfig';

/**
 * Minimal object store for sandbox snapshots — raw bytes by exact key, with no
 * presigned URLs, content-disposition, or expiry. Kept narrow on purpose so
 * providers can be unit-tested against a fake and the AWS phase can swap the
 * backing store without touching provider code.
 */
export interface SnapshotStore {
    put(key: string, body: Buffer): Promise<void>;
    get(key: string): Promise<Buffer>;
    delete(key: string): Promise<void>;
}

/**
 * S3/MinIO-backed {@link SnapshotStore}. Reuses {@link S3BaseClient} for
 * endpoint + credential resolution so it behaves identically to the rest of the
 * app's storage (locally: MinIO, zero new infra). Missing-config is surfaced at
 * call time, not construction, so it is safe to instantiate on the E2B path
 * where snapshots are never written.
 */
export class S3SnapshotStore extends S3BaseClient implements SnapshotStore {
    private readonly bucket: string | undefined;

    constructor({ lightdashConfig }: { lightdashConfig: LightdashConfig }) {
        super(lightdashConfig.s3);
        this.bucket = lightdashConfig.s3?.bucket;
    }

    private requireClient(): { client: S3; bucket: string } {
        if (!this.s3 || !this.bucket) {
            throw new MissingConfigError(
                "Missing S3 bucket configuration, can't store sandbox snapshots",
            );
        }
        return { client: this.s3, bucket: this.bucket };
    }

    async put(key: string, body: Buffer): Promise<void> {
        const { client, bucket } = this.requireClient();
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: 'application/gzip',
            }),
        );
    }

    async get(key: string): Promise<Buffer> {
        const { client, bucket } = this.requireClient();
        const response = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!response.Body) {
            throw new MissingConfigError(
                `Sandbox snapshot not found for key ${key}`,
            );
        }
        const bytes = await response.Body.transformToByteArray();
        return Buffer.from(bytes);
    }

    async delete(key: string): Promise<void> {
        const { client, bucket } = this.requireClient();
        await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        );
    }
}
