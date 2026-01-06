import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    getErrorMessage,
    MissingConfigError,
    ResultsExpiredError,
    WarehouseResults,
} from '@lightdash/common';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import Logger from '../../logging/logger';
import { createContentDispositionHeader } from '../../utils/FileDownloadUtils/FileDownloadUtils';
import {
    S3CacheClient,
    type S3CacheClientArguments,
} from '../Aws/S3CacheClient';

export class S3ResultsFileStorageClient extends S3CacheClient {
    private readonly s3ExpiresIn: number | undefined;

    constructor(args: S3CacheClientArguments) {
        super(args);

        const { lightdashConfig } = args;
        this.s3ExpiresIn = lightdashConfig.s3?.expirationTime;
    }

    static sanitizeFileExtension(
        fileName: string,
        fileExtension: string = 'jsonl',
    ) {
        const hasExtension = fileName
            .toLowerCase()
            .endsWith(`.${fileExtension.toLowerCase()}`);
        return hasExtension ? fileName : `${fileName}.${fileExtension}`;
    }

    get isEnabled() {
        return !!this.configuration && !!this.s3;
    }

    createUploadStream(
        fileName: string,
        opts: {
            contentType: string;
        },
        attachmentDownloadName?: string,
    ) {
        if (!this.configuration || !this.s3) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        const contentDisposition = createContentDispositionHeader(
            attachmentDownloadName || fileName,
        );

        Logger.debug(
            `Creating upload stream for ${this.configuration.bucket}/${fileName} with content disposition: ${contentDisposition} and contentType: ${opts.contentType}`,
        );

        // Write to temp file first, then upload to S3
        // This properly handles backpressure via fs.WriteStream's drain events
        const tempFilePath = path.join(
            os.tmpdir(),
            `lightdash-upload-${uuidv4()}.jsonl`,
        );
        const fileStream = fs.createWriteStream(tempFilePath, {
            highWaterMark: 16 * 1024 * 1024, // 16MB buffer
        });

        let totalRows = 0;
        const startTime = Date.now();

        const write = (rows: WarehouseResults['rows']): void => {
            for (const row of rows) {
                const chunk = `${JSON.stringify(row)}\n`;
                fileStream.write(chunk);
            }
            totalRows += rows.length;
        };

        let isClosed = false;
        const close = async () => {
            if (!this.configuration || !this.s3) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            if (isClosed) return;
            isClosed = true;

            try {
                // Close the file stream
                await new Promise<void>((resolve, reject) => {
                    fileStream.end((err: Error | null) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                const fileStat = await fs.promises.stat(tempFilePath);
                const fileSizeMB = (fileStat.size / 1024 / 1024).toFixed(1);

                // Upload the complete file to S3
                const readStream = fs.createReadStream(tempFilePath);
                const upload = new Upload({
                    client: this.s3,
                    params: {
                        Bucket: this.configuration.bucket,
                        Key: fileName,
                        Body: readStream,
                        ContentType: opts.contentType,
                        ContentDisposition: contentDisposition,
                    },
                });

                await upload.done();

                const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(
                    1,
                );
                Logger.debug(
                    `Uploaded ${totalRows} rows (${fileSizeMB}MB) to ${this.configuration.bucket}/${fileName} in ${totalElapsed}s`,
                );
            } catch (error) {
                Logger.error(
                    `Error uploading to ${
                        this.configuration.bucket
                    }/${fileName}: ${getErrorMessage(error)}`,
                );
                throw error;
            } finally {
                // Clean up temp file
                try {
                    await fs.promises.unlink(tempFilePath);
                } catch (unlinkError) {
                    Logger.warn(
                        `Failed to clean up temp file ${tempFilePath}: ${getErrorMessage(
                            unlinkError,
                        )}`,
                    );
                }
            }
        };

        return { write, close, writeStream: fileStream };
    }

    async getDownloadStream(
        cacheKey: string,
        fileExtension = 'jsonl',
    ): Promise<Readable> {
        const results = await this.getResults(cacheKey, fileExtension);
        if (!results.Body) {
            throw new ResultsExpiredError();
        }

        return results.Body as Readable;
    }

    async getFileUrl(cacheKey: string, fileExtension = 'jsonl') {
        if (!this.configuration || !this.s3) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        const key = S3ResultsFileStorageClient.sanitizeFileExtension(
            cacheKey,
            fileExtension,
        );

        // Get the S3 URL
        const url = await getSignedUrl(
            this.s3,
            new GetObjectCommand({
                Bucket: this.configuration.bucket,
                Key: key,
            }),
            {
                expiresIn: this.s3ExpiresIn,
            },
        );

        return url;
    }

    /**
     * Upload a file directly to S3 from a local file path
     * Useful for uploading pre-generated files like Excel files
     */
    async uploadFile(
        fileName: string,
        filePath: string,
        options: {
            contentType: string;
            attachmentDownloadName?: string;
        },
    ): Promise<string> {
        if (!this.configuration || !this.s3) {
            throw new MissingConfigError('S3 configuration is not set');
        }

        const fileStream = fs.createReadStream(filePath);

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: fileName,
                Body: fileStream,
                ContentType: options.contentType,
                ContentDisposition: createContentDispositionHeader(
                    options.attachmentDownloadName || fileName,
                ),
            },
        });

        try {
            await upload.done();
            Logger.debug(
                `Successfully uploaded file to ${this.configuration.bucket}/${fileName}`,
            );

            // Determine file extension for URL generation
            const fileExtension =
                fileName.toLowerCase().split('.').pop() || 'xlsx';
            return await this.getFileUrl(fileName, fileExtension);
        } catch (error) {
            Logger.error(
                `Failed to upload file to ${
                    this.configuration.bucket
                }/${fileName}: ${getErrorMessage(error)}`,
            );
            throw error;
        }
    }
}
