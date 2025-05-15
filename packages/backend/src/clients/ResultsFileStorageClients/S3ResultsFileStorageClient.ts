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

    createUploadStream(cacheKey: string) {
        const passThrough = new PassThrough();

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: `${cacheKey}.jsonl`,
                Body: passThrough,
                ContentType: 'application/jsonl',
                ContentDisposition: `attachment; filename="${cacheKey}.jsonl"`,
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
                    `Successfully closed upload stream to s3://${this.configuration.bucket}/${cacheKey}.jsonl`,
                );
            } catch (error) {
                Logger.error(
                    `Error closing upload stream to s3://${
                        this.configuration.bucket
                    }/${cacheKey}.jsonl: ${getErrorMessage(error)}`,
                );
                throw error;
            }
        };

        function createWriteChunk(stream: Writable) {
            let draining: Promise<void> | null = null;

            return async function writeChunk(chunk: string): Promise<void> {
                if (stream.write(chunk)) return;

                if (!draining) {
                    draining = once(stream, 'drain').then(() => {
                        draining = null;
                    });
                }

                await draining;
            };
        }

        const writeChunk = createWriteChunk(passThrough);

        const write = async (rows: WarehouseResults['rows']) => {
            try {
                for (const row of rows) {
                    // eslint-disable-next-line no-await-in-loop
                    await writeChunk(`${JSON.stringify(row)}\n`);
                }
            } catch (error) {
                Logger.error(
                    `Failed to write rows to cache key ${cacheKey}: ${getErrorMessage(
                        error,
                    )}`,
                );
                throw error;
            }
        };

        return { write, close };
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
        const url = await getSignedUrl(
            this.s3,
            new GetObjectCommand({
                Bucket: this.configuration.bucket,
                Key: `${cacheKey}.${fileExtension}`,
            }),
            {
                expiresIn: this.s3ExpiresIn,
            },
        );

        return url;
    }
}
