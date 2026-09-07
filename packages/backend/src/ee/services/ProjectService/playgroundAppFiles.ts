import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createS3ClientFromConfig } from '../../../clients/Aws/S3BaseClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type PlaygroundAppFileStore } from './seedPlaygroundContent';

type AppRuntimeS3Config = LightdashConfig['appRuntime']['s3'];

/**
 * The store a prebuilt data app's files are seeded into: the app runtime's
 * bucket, under the version prefix the preview router reads. Undefined when
 * the runtime has no bucket, in which case the seed skips apps.
 */
export const createPlaygroundAppFileStore = (
    s3Config: AppRuntimeS3Config,
): PlaygroundAppFileStore | undefined => {
    if (!s3Config) return undefined;
    const client = createS3ClientFromConfig(s3Config);
    return {
        put: async (key, body, contentType) => {
            await client.send(
                new PutObjectCommand({
                    Bucket: s3Config.bucket,
                    Key: key,
                    Body: body,
                    ContentType: contentType,
                }),
            );
        },
    };
};
