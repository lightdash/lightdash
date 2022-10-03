import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { getConfig } from '../../../config';
import * as styles from '../../../styles';
import { Target } from '../../types';
import { getBigqueryCredentialsFromOauth } from './oauth';
import {
    getBigqueryCredentialsFromServiceAccount,
    getBigqueryCredentialsFromServiceAccountJson,
} from './serviceAccount';

export const convertBigquerySchema = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    let getBigqueryCredentials;
    switch (target.method) {
        case 'oauth':
            getBigqueryCredentials = getBigqueryCredentialsFromOauth;
            break;
        case 'service-account':
            getBigqueryCredentials = getBigqueryCredentialsFromServiceAccount;
            break;
        case 'service-account-json':
            getBigqueryCredentials =
                getBigqueryCredentialsFromServiceAccountJson;
            break;
        default:
            throw new ParseError(
                `BigQuery method ${target.method} is not yet supported`,
            );
    }
    const getLocation = async () => {
        if (target.location) return target.location;
        
            const config = await getConfig();

            switch (config.context?.serverUrl) {
                case 'https://eu1.lightdash.cloud':
                    console.error(
                        `\n${styles.title(
                            'Warning',
                        )}: Missing location in profiles.yml, using EU by default`,
                    );

                    return 'EU';
                case 'https://app.lightdash.cloud':
                    console.error(
                        `\n${styles.title(
                            'Warning',
                        )}: Missing location in profiles.yml, using US by default`,
                    );

                    return 'US';
                default:
                    console.error(
                        `\n${styles.title(
                            'Warning',
                        )}: Missing location in profiles.yml and can't find valid serverUrl on config "${
                            config.context?.serverUrl
                        }", using US by default`,
                    );
                    return 'US';
            }
        
    };
    return {
        type: WarehouseTypes.BIGQUERY,
        project: target.project,
        dataset: target.dataset,
        timeoutSeconds: target.timeout_seconds,
        priority: target.priority,
        keyfileContents: await getBigqueryCredentials(target),
        retries: target.retries,
        location: await getLocation(),
        maximumBytesBilled: target.maximum_bytes_billed,
    };
};
