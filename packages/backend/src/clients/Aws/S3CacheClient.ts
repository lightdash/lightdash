import {
    GetObjectCommand,
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    PutObjectCommandInput,
    S3,
} from '@aws-sdk/client-s3';
import * as Sentry from '@sentry/node';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';

type S3CacheClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3CacheClient {
    configuration: LightdashConfig['resultsCache']['s3'];

    private readonly s3?: S3;

    constructor({ lightdashConfig }: S3CacheClientArguments) {
        const endpoint = lightdashConfig.s3?.endpoint;
        this.configuration = lightdashConfig.resultsCache.s3;
        const { region, accessKey, secretKey } = this.configuration;

        if (endpoint && region) {
            const s3Config = {
                endpoint,
                region,
                apiVersion: '2006-03-01',
            };

            if (accessKey && secretKey) {
                Object.assign(s3Config, {
                    credentials: {
                        accessKeyId: accessKey,
                        secretAccessKey: secretKey,
                    },
                });
                Logger.debug(
                    'Using results cache S3 storage with access key credentials',
                );
            } else {
                Logger.debug(
                    'Using results cache S3 storage with IAM role credentials',
                );
            }

            this.s3 = new S3(s3Config);
        } else {
            Logger.debug('Missing results cache S3 bucket configuration');
        }
    }

    isEnabled(): boolean {
        return this.s3 !== undefined;
    }

    async uploadResults(
        key: string,
        results: PutObjectCommandInput['Body'],
        metadata: PutObjectCommandInput['Metadata'],
    ) {
        if (!this.configuration.bucket || this.s3 === undefined) {
            throw new Error(
                "Results caching is not enabled or is missing S3 configuration, can't upload results cache",
            );
        }

        try {
            const command = new PutObjectCommand({
                Bucket: this.configuration.bucket,
                Key: `${key}.json`,
                Body: results,
                ContentType: 'application/json',
                Metadata: metadata,
            });
            return await this.s3.send(command);
        } catch (error) {
            Logger.error(`Failed to upload results to s3. ${error}`);
            Sentry.captureException(error);
            throw error;
        }
    }

    async getResultsMetadata(key: string) {
        if (this.configuration.bucket === undefined || this.s3 === undefined) {
            throw new Error(
                "Results caching is not enabled or is missing S3 configuration, can't get results cache metadata",
            );
        }
        try {
            const command = new HeadObjectCommand({
                Bucket: this.configuration.bucket,
                Key: `${key}.json`,
            });
            return await this.s3.send(command);
        } catch (error) {
            if (error instanceof NotFound) {
                return undefined;
            }
            Logger.error(`Failed to get results metadata from s3. ${error}`);
            Sentry.captureException(error);
            throw error;
        }
    }

    async getResults(key: string) {
        if (this.configuration.bucket === undefined || this.s3 === undefined) {
            throw new Error(
                "Results caching is not enabled or is missing S3 configuration, can't get results cache",
            );
        }
        try {
            const command = new GetObjectCommand({
                Bucket: this.configuration.bucket,
                Key: `${key}.json`,
            });
            return await this.s3.send(command);
        } catch (error) {
            Logger.error(`Failed to get results metadata from s3. ${error}`);
            Sentry.captureException(error);
            throw error;
        }
    }
}
