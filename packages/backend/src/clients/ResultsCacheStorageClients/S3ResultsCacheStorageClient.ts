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
import { PassThrough } from 'stream';
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

        const close = async () => {
            await upload.done();
            passThrough.end();
            // await writer.close();
        };

        return {
            write: async (rows: WarehouseResults['rows']) => {
                await Promise.all(
                    rows.map((row) =>
                        passThrough.write(`${JSON.stringify(row)}\n`),
                    ),
                );
            },
            close,
        };
    }

    async download(
        cacheKey: string,
        page: number,
        pageSize: number,
    ): Promise<ReadableStream> {
        try {
            const results = await this.getResults(cacheKey);
            if (!results.Body) {
                throw new Error('No results found');
            }
            return results.Body as ReadableStream;
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
