import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
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
    return {
        type: WarehouseTypes.BIGQUERY,
        project: target.project,
        dataset: target.dataset,
        timeoutSeconds: target.timeout_seconds,
        priority: target.priority,
        keyfileContents: await getBigqueryCredentials(target),
        retries: target.retries,
        location: target.location,
        maximumBytesBilled: target.maximum_bytes_billed,
    };
};
