import { SES } from '@aws-sdk/client-ses';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';

type SesClientArguments = {
    lightdashConfig: Pick<LightdashConfig, 'ses'>;
};

export const createSESClient = ({
    lightdashConfig,
}: SesClientArguments): SES | undefined => {
    if (lightdashConfig.ses) {
        const sesConfig = {
            region: lightdashConfig.ses.region,
            apiVersion: '2006-03-02',
            endpoint: lightdashConfig.ses.endpoint,
        };

        if (lightdashConfig.ses?.accessKey && lightdashConfig.ses.secretKey) {
            Object.assign(sesConfig, {
                credentials: {
                    accessKeyId: lightdashConfig.ses.accessKey,
                    secretAccessKey: lightdashConfig.ses.secretKey,
                },
            });
            Logger.debug('Using SES with access key credentials');
        } else {
            Logger.debug('Using SES with default credential provider chain');
        }

        return new SES(sesConfig);
    }
    Logger.debug('Missing SES configuration');
    return undefined;
};
