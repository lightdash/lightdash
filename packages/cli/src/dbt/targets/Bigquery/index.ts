import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { ajv } from '../../../ajv';
import { Target } from '../../types';
import { getBigqueryCredentialsFromOauth } from './oauth';
import {
    getBigqueryCredentialsFromServiceAccount,
    getBigqueryCredentialsFromServiceAccountJson,
} from './serviceAccount';

type BigqueryTarget = {
    project: string;
    dataset: string;
    schema: string;
    priority?: 'interactive' | 'batch';
    retries?: number;
    location?: string;
    maximum_bytes_billed?: number;
    timeout_seconds?: number;
};

export const bigqueryTargetJsonSchema: JSONSchemaType<BigqueryTarget> = {
    type: 'object',
    required: ['project'],
    properties: {
        project: {
            type: 'string',
        },
        dataset: {
            type: 'string',
        },
        schema: {
            type: 'string',
        },
        priority: {
            type: 'string',
            enum: ['interactive', 'batch'],
            nullable: true,
        },
        retries: {
            type: 'integer',
            nullable: true,
        },
        location: {
            type: 'string',
            nullable: true,
        },
        maximum_bytes_billed: {
            type: 'integer',
            nullable: true,
        },
        timeout_seconds: {
            type: 'integer',
            nullable: true,
        },
    },
    oneOf: [
        {
            required: ['dataset'],
        },
        {
            required: ['schema'],
        },
    ],
};

export const convertBigquerySchema = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    const validate = ajv.compile<BigqueryTarget>(bigqueryTargetJsonSchema);
    if (validate(target)) {
        let getBigqueryCredentials;
        switch (target.method) {
            case 'oauth':
                getBigqueryCredentials = getBigqueryCredentialsFromOauth;
                break;
            case 'service-account':
                getBigqueryCredentials =
                    getBigqueryCredentialsFromServiceAccount;
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
            dataset: target.dataset ?? target.schema,
            timeoutSeconds: target.timeout_seconds,
            priority: target.priority,
            keyfileContents: await getBigqueryCredentials(target),
            retries: target.retries,
            maximumBytesBilled: target.maximum_bytes_billed,
            location: target.location,
        };
    }
    const lineErrorMessages = (validate.errors || [])
        .map((err) => {
            if (err.keyword === 'oneOf') {
                return 'Profile should contain either `dataset` or `schema`';
            }

            return `Field at ${err.instancePath} ${err.message}`;
        })
        .join('\n');
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n  ${lineErrorMessages}`,
    );
};
