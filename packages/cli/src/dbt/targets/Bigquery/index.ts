import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import inquirer from 'inquirer';
import { getConfig, setAnswer } from '../../../config';
import { Target } from '../../types';
import { getBigqueryCredentialsFromOauth } from './oauth';
import {
    getBigqueryCredentialsFromServiceAccount,
    getBigqueryCredentialsFromServiceAccountJson,
} from './serviceAccount';

const askToRememberAnswer = async (): Promise<void> => {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'isConfirm',
            message: 'Do you want us to remember this answer forever ?',
        },
    ]);
    if (answers.isConfirm) {
        await setAnswer({
            warehouse: {
                bigquery: {
                    confirmSaveOauth: true,
                },
            },
        });
    }
};

const askPermissionToCopyOauth = async (): Promise<boolean> => {
    const config = await getConfig();
    const savedAnswer = config.answers?.warehouse?.bigquery?.confirmSaveOauth;
    if (!savedAnswer) {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isConfirm',
                message: `Do you confirm Lightdash can store your oauth credentials in the server ?`,
            },
        ]);
        if (answers.isConfirm) {
            await askToRememberAnswer();
        }
        return answers.isConfirm;
    }
    return savedAnswer;
};

export const convertBigquerySchema = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    let getBigqueryCredentials;
    switch (target.method) {
        case 'oauth': {
            if (await askPermissionToCopyOauth()) {
                getBigqueryCredentials = getBigqueryCredentialsFromOauth;
            } else {
                throw new Error(
                    'Bigquery authentication failed. Try using a different authentication type',
                );
            }
            break;
        }
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
