import { GetObjectCommand, NotFound } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getErrorMessage, WarehouseResults } from '@lightdash/common';
import fs from 'fs';
import { PassThrough, Readable, Writable } from 'stream';
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
        this.s3ExpiresIn = lightdashConfig.s3.expirationTime;
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

    createUploadStream(
        fileName: string,
        opts: {
            contentType: string;
        },
        attachmentDownloadName?: string,
    ) {
        const passThrough = new PassThrough();

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: fileName,
                Body: passThrough,
                ContentType: opts.contentType,
                ContentDisposition: createContentDispositionHeader(
                    attachmentDownloadName || fileName,
                ),
            },
        });

        let isClosed = false;
        const close = async () => {
            if (isClosed) return;
            isClosed = true;
            try {
                passThrough.end(); // signal EOF
                await upload.done(); // wait for upload to finish
                Logger.debug(
                    `Successfully closed upload stream to s3://${this.configuration.bucket}/${fileName}`,
                );
            } catch (error) {
                Logger.error(
                    `Error closing upload stream to s3://${
                        this.configuration.bucket
                    }/${fileName}: ${getErrorMessage(error)}`,
                );
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

    async getDowloadStream(
        cacheKey: string,
        fileExtension = 'jsonl',
    ): Promise<Readable> {
        try {
            const results = await this.getResults(cacheKey, fileExtension);
            if (!results.Body) {
                throw new Error('No results found');
            }

            return results.Body as Readable;
        } catch (error) {
            if (error instanceof NotFound) {
                throw new Error(`Cache key ${cacheKey} not found`);
            }
            Logger.error(
                `Failed to download results from s3. ${getErrorMessage(error)}`,
            );
            throw error;
        }
    }

    async getFileUrl(cacheKey: string, fileExtension = 'jsonl') {
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

    async transformResultsIntoNewFile(
        sourceResultsFileWithoutExtension: string,
        sinkFileName: string,
        streamProcessor: (
            readStream: Readable,
            writeStream: Writable,
        ) => Promise<{ truncated: boolean }>,
        attachmentDownloadName?: string,
    ): Promise<{ fileUrl: string; truncated: boolean }> {
        // File format configuration map
        const formatConfig = new Map([
            ['csv', { contentType: 'text/csv', extension: 'csv' }],
            [
                'xlsx',
                {
                    contentType:
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    extension: 'xlsx',
                },
            ],
            ['jsonl', { contentType: 'application/jsonl', extension: 'jsonl' }],
        ]);

        // Determine file format from extension
        const fileExtension =
            sinkFileName.toLowerCase().split('.').pop() || 'jsonl';
        const config =
            formatConfig.get(fileExtension) || formatConfig.get('jsonl')!;

        // Create upload stream
        const { writeStream, close } = this.createUploadStream(
            sinkFileName,
            {
                contentType: config.contentType,
            },
            attachmentDownloadName
                ? `${attachmentDownloadName}.${config.extension}`
                : undefined,
        );

        // Get the results stream
        const resultsStream = await this.getDowloadStream(
            sourceResultsFileWithoutExtension,
        );

        // Process the stream
        const { truncated } = await streamProcessor(resultsStream, writeStream);

        await close();

        const url = await this.getFileUrl(sinkFileName, config.extension);

        return {
            fileUrl: url,
            truncated,
        };
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
                `Successfully uploaded file to s3://${this.configuration.bucket}/${fileName}`,
            );

            // Determine file extension for URL generation
            const fileExtension =
                fileName.toLowerCase().split('.').pop() || 'xlsx';
            return await this.getFileUrl(fileName, fileExtension);
        } catch (error) {
            Logger.error(
                `Failed to upload file to s3://${
                    this.configuration.bucket
                }/${fileName}: ${getErrorMessage(error)}`,
            );
            throw error;
        }
    }
}
