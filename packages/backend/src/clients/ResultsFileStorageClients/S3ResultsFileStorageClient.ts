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
import { PassThrough, Readable } from 'stream';
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

        // Use a larger buffer (16MB) to allow the S3 Upload to start consuming
        // before backpressure kicks in. Without this, the first write() might
        // return false immediately before Upload starts reading, causing deadlock.
        const passThrough = new PassThrough({
            highWaterMark: 16 * 1024 * 1024,
        });

        const contentDisposition = createContentDispositionHeader(
            attachmentDownloadName || fileName,
        );

        Logger.debug(
            `Creating upload stream for ${this.configuration.bucket}/${fileName} with content disposition: ${contentDisposition} and contentType: ${opts.contentType}`,
        );

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: fileName,
                Body: passThrough,
                ContentType: opts.contentType,
                ContentDisposition: contentDisposition,
            },
        });

        // Start the upload immediately so it begins consuming from the PassThrough.
        // Without this, the Upload won't read until done() is called, causing deadlock
        // when the PassThrough buffer fills up waiting for drain.
        const uploadPromise = upload.done();

        let isClosed = false;
        const close = async () => {
            if (!this.configuration) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            if (isClosed) return;
            isClosed = true;
            try {
                passThrough.end(); // signal EOF
                await uploadPromise; // wait for upload to finish
                Logger.debug(
                    `Successfully closed upload stream to ${this.configuration.bucket}/${fileName}`,
                );
            } catch (error) {
                Logger.error(
                    `Error closing upload stream to ${
                        this.configuration.bucket
                    }/${fileName}: ${getErrorMessage(error)}`,
                );
                Logger.debug(`Full error: ${JSON.stringify(error)}`);
                throw error;
            }
        };

        // Create a function that can be used as a streamQuery callback
        // This function handles backpressure by waiting for drain when buffer is full.
        const write = async (rows: WarehouseResults['rows']): Promise<void> => {
            try {
                for (let i = 0; i < rows.length; i += 1) {
                    const canContinue = passThrough.write(
                        `${JSON.stringify(rows[i])}\n`,
                    );
                    if (!canContinue) {
                        // Buffer is full, wait for drain before continuing
                        // eslint-disable-next-line no-await-in-loop
                        await new Promise<void>((resolve) => {
                            passThrough.once('drain', resolve);
                        });
                    }
                }
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

    /**
     * Get the first line of a JSONL file from S3
     * Useful for extracting column order from query results
     */
    async getFirstLine(
        cacheKey: string,
        fileExtension = 'jsonl',
    ): Promise<string | null> {
        try {
            const stream = await this.getDownloadStream(
                cacheKey,
                fileExtension,
            );
            // eslint-disable-next-line @typescript-eslint/return-await
            return await new Promise((resolve, reject) => {
                let buffer = '';
                const onData = (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const newlineIndex = buffer.indexOf('\n');
                    if (newlineIndex !== -1) {
                        stream.destroy(); // Stop reading after first line
                        resolve(buffer.slice(0, newlineIndex));
                    }
                };
                stream.on('data', onData);
                stream.on('end', () => resolve(buffer || null));
                stream.on('error', reject);
            });
        } catch (error) {
            Logger.warn(
                `Failed to get first line from ${cacheKey}: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
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
