import { GetObjectCommand, NotFound } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getErrorMessage, WarehouseResults } from '@lightdash/common';
import { once, PassThrough, Readable, Writable } from 'stream';
import Logger from '../../logging/logger';
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

    createUploadStream(
        fileName: string,
        opts: {
            contentType: string;
        },
    ) {
        const passThrough = new PassThrough();

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: fileName,
                Body: passThrough,
                ContentType: opts.contentType,
                ContentDisposition: `attachment; filename="${fileName}"`,
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
        // Check if the cacheKey already has the specified file extension
        const hasExtension = cacheKey
            .toLowerCase()
            .endsWith(`.${fileExtension.toLowerCase()}`);
        const key = hasExtension ? cacheKey : `${cacheKey}.${fileExtension}`;

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
    ): Promise<{ fileUrl: string; truncated: boolean }> {
        // Determine content type based on file extension
        const isCsv = sinkFileName.toLowerCase().endsWith('.csv');
        const contentType = isCsv ? 'text/csv' : 'application/jsonl';

        // Create upload stream
        const { writeStream, close } = this.createUploadStream(sinkFileName, {
            contentType,
        });

        // Get the results stream
        const resultsStream = await this.getDowloadStream(
            sourceResultsFileWithoutExtension,
        );

        // Process the stream
        const { truncated } = await streamProcessor(resultsStream, writeStream);

        await close();

        // Extract extension from filename to ensure correct URL generation
        const extension = isCsv ? 'csv' : 'jsonl';
        const url = await this.getFileUrl(sinkFileName, extension);

        return {
            fileUrl: url,
            truncated,
        };
    }
}
