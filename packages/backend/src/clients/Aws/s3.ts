import {
    GetObjectCommand,
    PutObjectCommandInput,
    S3,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MissingConfigError } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { ReadStream } from 'fs';
import { PassThrough, Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';

type S3ClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3Client {
    lightdashConfig: LightdashConfig;

    private readonly s3?: S3;

    constructor({ lightdashConfig }: S3ClientArguments) {
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
            throw new MissingConfigError(
                "Missing S3 bucket configuration, can't upload files",
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

    async uploadZip(zip: ReadStream, zipName: string): Promise<string> {
        return this.uploadFile(zipName, zip, 'application/zip');
    }

    /*
    This method streams the results into an s3 object
    It returns a function to call when the streaming ends,then it returns the signed url of the object uploaded
    */
    async streamResults(
        buffer: PassThrough,
        fileId: string,
    ): Promise<() => Promise<string>> {
        if (!this.lightdashConfig.s3?.bucket || this.s3 === undefined) {
            throw new MissingConfigError(
                "Missing S3 bucket configuration, can't upload files",
            );
        }
        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.lightdashConfig.s3.bucket,
                Key: fileId,
                Body: buffer,
                ContentType: `application/jsonl`,
                ACL: 'private',
                ContentDisposition: `attachment; filename="${fileId}"`,
            },
        });

        const onEnd = async () => {
            try {
                await upload.done();
                return fileId; // We don't need to return signed url, we will stream the file from the fileId
            } catch (error) {
                Logger.error(
                    `Failed to upload file to s3 with endpoint: ${
                        this.lightdashConfig.s3!.endpoint ?? 'no endpoint'
                    }. ${error}`,
                );
                Sentry.captureException(error);

                throw error;
            }
        };

        return onEnd;
    }

    async getS3FileStream(fileId: string): Promise<Readable> {
        const command = new GetObjectCommand({
            Bucket: this.lightdashConfig.s3!.bucket,
            Key: fileId,
        });

        try {
            const response = await this.s3?.send(command);
            if (response === undefined) {
                throw new Error('No response from S3');
            }
            return response.Body as Readable;
        } catch (error) {
            console.error('Error fetching the file from S3:', error);
            throw error;
        }
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
