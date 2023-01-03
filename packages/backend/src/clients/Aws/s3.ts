import * as AWS from 'aws-sdk';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';

type S3ServiceDependencies = {
    lightdashConfig: LightdashConfig;
};

export class S3Service {
    lightdashConfig: LightdashConfig;

    private s3?: AWS.S3;

    constructor({ lightdashConfig }: S3ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;

        if (
            lightdashConfig.s3?.accessKey &&
            lightdashConfig.s3.secretKey &&
            lightdashConfig.s3.endpoint
        ) {
            const credentials = new AWS.Credentials({
                accessKeyId: lightdashConfig.s3.accessKey,
                secretAccessKey: lightdashConfig.s3.secretKey,
            });
            this.s3 = new AWS.S3({
                credentials,
                apiVersion: '2006-03-01',
                endpoint: lightdashConfig.s3.endpoint,
            });
            Logger.debug('Using S3 storage');
        } else {
            Logger.debug('Missing S3 bucket configuration');
        }
    }

    async uploadImage(image: Buffer, imageId: string): Promise<string> {
        if (!this.lightdashConfig.s3?.bucket || this.s3 === undefined) {
            throw new Error(
                "Missing S3 bucket configuration, can't upload image",
            );
        }
        const params: AWS.S3.PutObjectRequest = {
            Body: image,
            ACL: 'public-read',
            Bucket: this.lightdashConfig.s3.bucket,
            Key: imageId,
        };
        const data = await this.s3.upload(params).promise();
        return data.Location;
    }

    isEnabled(): boolean {
        return this.s3 !== undefined;
    }
}
