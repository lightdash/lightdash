import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MissingConfigError } from '@lightdash/common';
import { createS3ClientFromConfig } from '../../../clients/Aws/S3BaseClient';
import { type LightdashConfig } from '../../../config/parseConfig';

export type AppRuntimeS3 = { client: S3Client; bucket: string };

/** The bucket holding data app artifacts; throws when it is not configured. */
export const createAppRuntimeS3 = (
    lightdashConfig: Pick<LightdashConfig, 'appRuntime'>,
): AppRuntimeS3 => {
    const s3Config = lightdashConfig.appRuntime.s3;
    if (!s3Config) {
        throw new MissingConfigError('S3 is not configured for app runtime');
    }
    return {
        client: createS3ClientFromConfig(s3Config),
        bucket: s3Config.bucket,
    };
};

export const readS3ObjectAsBuffer = async (
    s3Client: S3Client,
    bucket: string,
    key: string,
): Promise<Buffer> => {
    const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = response.Body;
    if (!body || typeof (body as NodeJS.ReadableStream).on !== 'function') {
        throw new Error(`Unexpected S3 response body type for key=${key}`);
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};
