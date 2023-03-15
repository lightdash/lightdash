import {
    GetObjectCommand,
    PutObjectCommand,
    PutObjectCommandInput,
    S3,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ReadStream } from 'fs-extra';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';

type S3ServiceDependencies = {
    lightdashConfig: LightdashConfig;
};

const DEFAULT_EXPIRES_IN = 259200; // 3 days in seconds

export class S3Service {
    lightdashConfig: LightdashConfig;

    private readonly s3?: S3;

    constructor({ lightdashConfig }: S3ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;

        if (lightdashConfig.s3?.endpoint && lightdashConfig.s3.region) {
            const s3Config = {
                region: lightdashConfig.s3.region,
                apiVersion: '2006-03-01',
                endpoint: lightdashConfig.s3.endpoint,
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
        urlOptions?: { expiresIn: number },
    ): Promise<string> {
        if (!this.lightdashConfig.s3?.bucket || this.s3 === undefined) {
            throw new Error(
                "Missing S3 bucket configuration, can't upload image",
            );
        }
        const putCommand = new PutObjectCommand({
            Body: file,
            ACL: 'public-read',
            Bucket: this.lightdashConfig.s3.bucket,
            Key: fileId,
        });
        try {
            await this.s3.send(putCommand);
        } catch (error) {
            Logger.error(`Failed to upload file to s3. ${error}`);
            throw error;
        }

        const getCommand = new GetObjectCommand({
            Bucket: this.lightdashConfig.s3.bucket,
            Key: fileId,
        });
        return getSignedUrl(this.s3, getCommand, {
            expiresIn: DEFAULT_EXPIRES_IN,
            ...urlOptions,
        });
    }

    async uploadImage(image: Buffer, imageId: string): Promise<string> {
        return this.uploadFile(imageId, image);
    }

    async uploadCsv(
        csv: string | ReadStream,
        csvName: string,
    ): Promise<string> {
        return this.uploadFile(csvName, csv);
    }

    isEnabled(): boolean {
        return this.s3 !== undefined;
    }
}
