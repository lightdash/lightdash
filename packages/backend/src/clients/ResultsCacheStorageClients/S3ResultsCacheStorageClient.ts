import {
    GetObjectCommand,
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    PutObjectCommandInput,
    S3,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
    getErrorMessage,
    MissingConfigError,
    S3Error,
    WarehouseResults,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { PassThrough, Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { wrapSentryTransaction } from '../../utils';
import { S3CacheClient } from '../Aws/S3CacheClient';
import { IResultsCacheStorageClient } from './ResultsCacheStorageClient';

export class S3ResultsCacheStorageClient
    extends S3CacheClient
    implements IResultsCacheStorageClient
{
    createUploadStream(cacheKey: string, pageSize: number) {
        if (!this.s3) {
            throw new Error('S3 is not initialized');
        }

        const passThrough = new PassThrough();

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: this.configuration.bucket,
                Key: `${cacheKey}.jsonl`,
                Body: passThrough,
                ACL: 'private',
                ContentType: 'application/jsonl',
                ContentDisposition: `attachment; filename="${cacheKey}"`,
            },
        });

        let isClosed = false;
        const close = async () => {
            if (isClosed) return;
            isClosed = true;
            try {
                passThrough.end();
                await upload.done();
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

        return {
            write: async (rows: WarehouseResults['rows']) => {
                try {
                    rows.map((row) =>
                        passThrough.write(`${JSON.stringify(row)}\n`),
                    );
                } catch (error) {
                    Logger.error(
                        `Failed to write rows to cache key ${cacheKey}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                    throw error;
                }
            },
            close,
        };
    }

    async download(
        cacheKey: string,
        page: number,
        pageSize: number,
    ): Promise<Readable> {
        try {
            const results = await this.getResults(cacheKey, 'jsonl');
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
}
