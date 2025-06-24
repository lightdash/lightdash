import {
    GetObjectCommand,
    PutObjectCommandInput,
    S3,
    S3ServiceException,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    getErrorMessage,
    MissingConfigError,
    S3Error,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { ReadStream } from 'fs';
import { PassThrough, Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { createContentDispositionHeader } from '../../utils/FileDownloadUtils/FileDownloadUtils';

type S3ClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3Client {
    lightdashConfig: LightdashConfig;

    private readonly s3?: S3;

    constructor({ lightdashConfig }: S3ClientArguments) {
        this.lightdashConfig = lightdashConfig;

        if (lightdashConfig.s3?.endpoint && lightdashConfig.s3.region) {
            const s3Config: S3ClientConfig = {
                region: lightdashConfig.s3.region,
                apiVersion: '2006-03-01',
                endpoint: lightdashConfig.s3.endpoint,
                forcePathStyle: lightdashConfig.s3.forcePathStyle,
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
                ContentDisposition: createContentDispositionHeader(fileId),
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
            if (error instanceof S3ServiceException) {
                Logger.error(
                    `Failed to upload file to s3 with endpoint: ${
                        this.lightdashConfig.s3.endpoint ?? 'no endpoint'
                    }. ${error.name} - ${error.message}`,
                );
            } else {
                Logger.error(
                    `Failed to upload file to s3 with endpoint: ${
                        this.lightdashConfig.s3.endpoint ?? 'no endpoint'
                    }. ${getErrorMessage(error)}`,
                );
            }

            Sentry.captureException(
                new S3Error(
                    `Failed to upload file to s3 with endpoint: ${
                        this.lightdashConfig.s3.endpoint ?? 'no endpoint'
                    }. ${getErrorMessage(error)}`,
                    {
                        fileId,
                    },
                ),
            );

            throw error;
        }
    }

    async uploadPdf(
        pdf: Buffer,
        id: string,
    ): Promise<{
        fileName: string;
        url: string;
    }> {
        const fileName = `${id}.pdf`;
        const url = await this.uploadFile(fileName, pdf, 'application/pdf');
        return { fileName, url };
    }

    async uploadTxt(txt: Buffer, id: string): Promise<string> {
        return this.uploadFile(`${id}.txt`, txt, 'text/plain');
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
                ContentDisposition: createContentDispositionHeader(fileId),
            },
        });

        const onEnd = async () => {
            try {
                await upload.done();
                return fileId; // We don't need to return signed url, we will stream the file from the fileId
            } catch (error) {
                if (error instanceof S3ServiceException) {
                    Logger.error(
                        `Failed to stream results to S3 on upload: ${
                            this.lightdashConfig.s3?.endpoint ?? 'no endpoint'
                        }. ${error.name} - ${error.message}`,
                    );
                } else {
                    Logger.error(
                        `Failed to stream results to S3 on upload: ${
                            this.lightdashConfig.s3?.endpoint ?? 'no endpoint'
                        }. ${getErrorMessage(error)}`,
                    );
                }

                Sentry.captureException(
                    new S3Error(
                        `Failed to stream results to S3 on upload: ${
                            this.lightdashConfig.s3?.endpoint ?? 'no endpoint'
                        }. ${getErrorMessage(error)}`,
                        {
                            fileId,
                        },
                    ),
                );

                throw error;
            }
        };

        return onEnd;
    }

    async getS3FileStream(fileId: string): Promise<Readable> {
        const command = new GetObjectCommand({
            Bucket: this.lightdashConfig.s3?.bucket,
            Key: fileId,
        });

        try {
            const response = await this.s3?.send(command);
            if (response === undefined) {
                throw new S3Error('No response from S3', { fileId });
            }
            return response.Body as Readable;
        } catch (error) {
            if (error instanceof S3Error) {
                Sentry.captureException(error);
                throw error;
            }
            if (error instanceof S3ServiceException) {
                Logger.error(
                    `Failed to fetch file from S3: ${error.name} - ${error.message}`,
                );
            } else {
                Logger.error(
                    `Failed to fetch file from S3: ${getErrorMessage(error)}`,
                );
            }

            Sentry.captureException(
                new S3Error(
                    `Failed to fetch file from S3: ${getErrorMessage(error)}`,
                    {
                        fileId,
                    },
                ),
            );

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
