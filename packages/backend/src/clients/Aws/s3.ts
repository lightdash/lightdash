import {
    GetObjectCommand,
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    PutObjectCommandInput,
    S3,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as Sentry from '@sentry/node';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { wrapOtelSpan } from '../../utils';

type ClientDependencies = {
    lightdashConfig: LightdashConfig;
};

export class S3Client {
    lightdashConfig: LightdashConfig;

    private readonly s3?: S3;

    constructor({ lightdashConfig }: ClientDependencies) {
        this.lightdashConfig = lightdashConfig;

        if (lightdashConfig.s3?.endpoint && lightdashConfig.s3.region) {
            const s3Config = {
                region: lightdashConfig.s3.region,
                apiVersion: '2006-03-01',
                endpoint: lightdashConfig.s3.endpoint,
            };

            if (lightdashConfig.s3?.accessKey && lightdashConfig.s3.secretKey) {
                Object.assign(s3Config, {
                    credentials: {
                        accessKeyId: lightdashConfig.s3.accessKey,
                        secretAccessKey: lightdashConfig.s3.secretKey,
                    },
                });
                Logger.debug('Using S3 storage with access key credentials');
            } else {
                Logger.debug('Using S3 storage with IAM role credentials');
            }

            this.s3 = new S3(s3Config);
        } else {
            Logger.debug('Missing S3 bucket configuration');
        }
    }

    private async uploadFile(
        fileId: string,
        file: PutObjectCommandInput['Body'],
        contentType: string,
        urlOptions?: { expiresIn: number },
    ): Promise<string> {
        if (!this.lightdashConfig.s3?.bucket || this.s3 === undefined) {
            throw new Error(
                "Missing S3 bucket configuration, can't upload image",
            );
        }
        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.lightdashConfig.s3.bucket,
                Key: fileId,
                Body: file,
                ContentType: contentType,
                ACL: 'private',
                ContentDisposition: `attachment; filename="${fileId}"`,
            },
        });
        try {
            await upload.done();
            const url = await getSignedUrl(
                this.s3,
                new GetObjectCommand({
                    Bucket: this.lightdashConfig.s3.bucket,
                    Key: fileId,
                }),
                {
                    expiresIn: this.lightdashConfig.s3.expirationTime,
                    ...urlOptions,
                },
            );
            return url;
        } catch (error) {
            Logger.error(
                `Failed to upload file to s3 with endpoint: ${
                    this.lightdashConfig.s3.endpoint ?? 'no endpoint'
                }. ${error}`,
            );
            Sentry.captureException(error);

            throw error;
        }
    }

    async uploadImage(image: Buffer, imageId: string): Promise<string> {
        return this.uploadFile(`${imageId}.png`, image, 'image/png');
    }

    async uploadCsv(
        csv: PutObjectCommandInput['Body'],
        csvName: string,
    ): Promise<string> {
        return this.uploadFile(csvName, csv, 'text/csv');
    }

    async uploadResults(
        key: string,
        results: PutObjectCommandInput['Body'],
        metadata: PutObjectCommandInput['Metadata'],
    ) {
        return wrapOtelSpan('s3.uploadResults', { key }, async () => {
            if (
                !this.lightdashConfig.resultsCache?.enabled ||
                !this.lightdashConfig.resultsCache.s3Bucket ||
                this.s3 === undefined
            ) {
                throw new Error(
                    "Results caching is not enabled or is missing S3 configuration, can't upload results cache",
                );
            }

            try {
                const command = new PutObjectCommand({
                    Bucket: this.lightdashConfig.resultsCache.s3Bucket,
                    Key: `${key}.json`,
                    Body: results,
                    ContentType: 'application/json',
                    Metadata: metadata,
                });
                const response = await this.s3.send(command);
            } catch (error) {
                Logger.error(`Failed to upload results to s3. ${error}`);
                Sentry.captureException(error);
                throw error;
            }
        });
    }

    async getResultsMetadata(key: string) {
        return wrapOtelSpan('s3.getResultsMetadata', { key }, async (span) => {
            if (
                !this.lightdashConfig.resultsCache?.enabled ||
                !this.lightdashConfig.resultsCache.s3Bucket ||
                this.s3 === undefined
            ) {
                throw new Error(
                    "Results caching is not enabled or is missing S3 configuration, can't get results cache metadata",
                );
            }
            try {
                const command = new HeadObjectCommand({
                    Bucket: this.lightdashConfig.resultsCache.s3Bucket,
                    Key: `${key}.json`,
                });
                return await this.s3.send(command);
            } catch (error) {
                if (error instanceof NotFound) {
                    return undefined;
                }
                Logger.error(
                    `Failed to get results metadata from s3. ${error}`,
                );
                Sentry.captureException(error);
                throw error;
            }
        });
    }

    async getResults(key: string) {
        return wrapOtelSpan('s3.getResults', { key }, async (span) => {
            if (
                !this.lightdashConfig.resultsCache?.enabled ||
                !this.lightdashConfig.resultsCache.s3Bucket ||
                this.s3 === undefined
            ) {
                throw new Error(
                    "Results caching is not enabled or is missing S3 configuration, can't get results cache",
                );
            }
            try {
                const command = new GetObjectCommand({
                    Bucket: this.lightdashConfig.resultsCache.s3Bucket,
                    Key: `${key}.json`,
                });
                return await this.s3.send(command);
            } catch (error) {
                Logger.error(
                    `Failed to get results metadata from s3. ${error}`,
                );
                Sentry.captureException(error);
                throw error;
            }
        });
    }

    isEnabled(): boolean {
        return this.s3 !== undefined;
    }

    getExpirationWarning() {
        if (this.isEnabled()) {
            const timeInSeconds =
                this.lightdashConfig.s3?.expirationTime || 259200;
            const expirationDays = Math.floor(timeInSeconds / 60 / 60 / 24);
            return {
                slack: `For security reasons, delivered files expire after *${expirationDays}* days.`,
                days: expirationDays,
            };
        }
        return undefined;
    }
}
