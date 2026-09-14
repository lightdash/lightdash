import {
    GetObjectCommand,
    PutObjectCommand,
    type S3,
} from '@aws-sdk/client-s3';
import { MissingConfigError } from '@lightdash/common';
import { S3BaseClient } from '../../../clients/Aws/S3BaseClient';
import { type LightdashConfig } from '../../../config/parseConfig';

export class OnboardingAgentFileStore extends S3BaseClient {
    private readonly bucket: string | undefined;

    constructor({ lightdashConfig }: { lightdashConfig: LightdashConfig }) {
        super(lightdashConfig.s3 ?? undefined);
        this.bucket = lightdashConfig.s3?.bucket;
    }

    private requireClient(): { client: S3; bucket: string } {
        if (!this.s3 || !this.bucket) {
            throw new MissingConfigError(
                "Missing S3 bucket configuration, can't store onboarding agent files",
            );
        }
        return { client: this.s3, bucket: this.bucket };
    }

    assertConfigured(): void {
        this.requireClient();
    }

    async put(key: string, contents: Buffer): Promise<void> {
        const { client, bucket } = this.requireClient();
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: contents,
                ContentType: 'application/octet-stream',
            }),
        );
    }

    async get(key: string): Promise<Buffer> {
        const { client, bucket } = this.requireClient();
        const result = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!result.Body) {
            throw new MissingConfigError(
                `Onboarding agent file not found for key ${key}`,
            );
        }
        return Buffer.from(await result.Body.transformToByteArray());
    }
}
