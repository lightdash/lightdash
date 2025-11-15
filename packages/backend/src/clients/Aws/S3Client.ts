import {
    GetObjectCommand,
    PutObjectCommandInput,
    S3,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    DownloadFileType,
    getErrorMessage,
    MissingConfigError,
    S3Error,
    type WarehouseResults,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { ReadStream } from 'fs';
import { PassThrough, Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { createContentDispositionHeader } from '../../utils/FileDownloadUtils/FileDownloadUtils';
import getContentTypeFromFileType from './getContentTypeFromFileType';
import { S3BaseClient } from './S3BaseClient';

type S3ClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3Client extends S3BaseClient {
    lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: S3ClientArguments) {
        super(lightdashConfig.s3);
        this.lightdashConfig = lightdashConfig;
    }

    private async uploadFile(
        fileId: string,
        file: PutObjectCommandInput['Body'],
        fileOpts: { contentType: string; attachmentDownloadName?: string },
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
                ContentType: fileOpts.contentType,
                ACL: 'private',
                ContentDisposition: createContentDispositionHeader(
                    fileOpts.attachmentDownloadName || fileId,
                ),
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
        const url = await this.uploadFile(fileName, pdf, {
            contentType: 'application/pdf',
        });
        return { fileName, url };
    }

    async uploadTxt(txt: Buffer, id: string): Promise<string> {
        return this.uploadFile(`${id}.txt`, txt, { contentType: 'text/plain' });
    }

    async uploadImage(image: Buffer, imageId: string): Promise<string> {
        return this.uploadFile(`${imageId}.png`, image, {
            contentType: 'image/png',
        });
    }

    async uploadCsv(
        csv: PutObjectCommandInput['Body'],
        csvName: string,
        attachmentDownloadName?: string,
    ): Promise<string> {
        return this.uploadFile(csvName, csv, {
            contentType: 'text/csv',
            attachmentDownloadName,
        });
    }

    async uploadZip(zip: ReadStream, zipName: string): Promise<string> {
        return this.uploadFile(zipName, zip, {
            contentType: 'application/zip',
        });
    }

    async uploadExcel(
        excel: ReadStream,
        excelName: string,
        attachmentDownloadName?: string,
    ): Promise<string> {
        return this.uploadFile(excelName, excel, {
            contentType: getContentTypeFromFileType(DownloadFileType.XLSX),
            attachmentDownloadName,
        });
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

    /**
     * Creates an upload stream for writing data directly to S3
     * This is same as createUploadStream from S3ResultsFileStorageClient but for the exports bucket
     * @param fileName - Name of the file to upload
     * @param opts - Upload options including content type
     * @param attachmentDownloadName - Optional download name for Content-Disposition header
     * @returns Object with write function, close function, and the PassThrough stream
     */
    createResultsExportUploadStream(
        fileName: string,
        opts: {
            contentType: string;
        },
        attachmentDownloadName?: string,
    ) {
        if (!this.lightdashConfig.s3 || !this.s3) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        const passThrough = new PassThrough();

        const contentDisposition = createContentDispositionHeader(
            attachmentDownloadName || fileName,
        );

        Logger.debug(
            `Creating upload stream for ${this.lightdashConfig.s3.bucket}/${fileName} with content disposition: ${contentDisposition} and contentType: ${opts.contentType}`,
        );

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.lightdashConfig.s3.bucket,
                Key: fileName,
                Body: passThrough,
                ContentType: opts.contentType,
                ContentDisposition: contentDisposition,
            },
        });

        let isClosed = false;
        const close = async () => {
            if (!this.lightdashConfig.s3) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            if (isClosed) return;
            isClosed = true;
            try {
                passThrough.end(); // signal EOF
                await upload.done(); // wait for upload to finish
                Logger.debug(
                    `Successfully closed upload stream to ${this.lightdashConfig.s3.bucket}/${fileName}`,
                );
            } catch (error) {
                Logger.error(
                    `Error closing upload stream to ${
                        this.lightdashConfig.s3.bucket
                    }/${fileName}: ${getErrorMessage(error)}`,
                );
                Logger.debug(`Full error: ${JSON.stringify(error)}`);
                throw error;
            }
        };

        // Create a function that can be used as a streamQuery callback
        const write = (rows: WarehouseResults['rows']) => {
            try {
                rows.forEach((row) =>
                    passThrough.push(`${JSON.stringify(row)}\n`),
                );
            } catch (error) {
                Logger.error(
                    `Failed to write rows to fileName ${fileName}: ${getErrorMessage(
                        error,
                    )}`,
                );
                throw error;
            }
        };

        return { write, close, writeStream: passThrough };
    }

    /**
     * Get a pre-signed URL for a file in S3
     * @param fileName - Name of the file
     * @returns Pre-signed URL for downloading the file
     */
    async getFileUrl(fileName: string) {
        if (!this.lightdashConfig.s3?.bucket || this.s3 === undefined) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        // Get the S3 URL
        const url = await getSignedUrl(
            this.s3,
            new GetObjectCommand({
                Bucket: this.lightdashConfig.s3.bucket,
                Key: fileName,
            }),
            {
                expiresIn: this.lightdashConfig.s3.expirationTime,
            },
        );

        return url;
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
