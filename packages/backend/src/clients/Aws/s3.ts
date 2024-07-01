import {
    GetObjectCommand,
    PutObjectCommandInput,
    S3,
    SelectObjectContentCommandInput,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MissingConfigError } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { ReadStream } from 'fs';
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

            const command: SelectObjectContentCommandInput = {
                Bucket: lightdashConfig.s3.bucket,
                // Key: 'results.json',
                Key: 'csv-payments-2024-06-27-14-18-47-3670.csv',
                ExpressionType: 'SQL',
                Expression: 'SELECT * FROM S3Object LIMIT 5',
                InputSerialization: {
                    CSV: {},
                },
                OutputSerialization: {
                    CSV: {},
                },
            };
            console.log('requesting object', command);
            this.s3
                .selectObjectContent(command)
                .then((url) => {
                    console.log('url', url);
                })
                .catch((error) => {
                    console.error('error s3', error);
                });
            /* if (this.lightdashConfig.s3)  getSignedUrl(
                this.s3,
                new GetObjectCommand({
                    Bucket: this.lightdashConfig.s3.bucket,
                    Key: 'results.json',
                    ExpressionType: 'SQL',
                    Expression: 'SELECT * limit 5',
                }),
                {
                    expiresIn: this.lightdashConfig.s3.expirationTime,
                },
            ).then((url) => {
                console.log('url', url)
            }) */
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
        console.log('this.lightdashConfig.s3', this.lightdashConfig.s3);
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
            console.error('error', error);
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
