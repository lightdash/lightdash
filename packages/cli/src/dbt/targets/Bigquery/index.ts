import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../../ajv';
import { Target } from '../../types';
import { getBigqueryCredentialsFromOauth } from './oauth';
import {
    getBigqueryCredentialsFromServiceAccount,
    getBigqueryCredentialsFromServiceAccountJson,
} from './serviceAccount';

type BigqueryTarget = {
    project?: string;
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
    properties: {
        project: {
            type: 'string',
            nullable: true,
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
    required: [],
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
        let keyfileContents: Record<string, string>;
        let { project } = target;
        switch (target.method) {
            case 'oauth':
                keyfileContents = await getBigqueryCredentialsFromOauth();
                // fallback to project from oauth
                if (!project && keyfileContents.project_id) {
                    project = keyfileContents.project_id;
                }
                break;
            case 'service-account':
                keyfileContents =
                    await getBigqueryCredentialsFromServiceAccount(target);
                break;
            case 'service-account-json':
                keyfileContents =
                    await getBigqueryCredentialsFromServiceAccountJson(target);
                break;
            default:
                throw new ParseError(
                    `BigQuery method ${target.method} is not yet supported`,
                );
        }

        if (project === undefined) {
            throw new ParseError(
                `BigQuery project is required for ${target.method} authentication method`,
            );
        }

        return {
            type: WarehouseTypes.BIGQUERY,
            project,
            dataset: target.dataset || target.schema,
            timeoutSeconds: target.timeout_seconds,
            priority: target.priority,
            keyfileContents,
            retries: target.retries,
            maximumBytesBilled: target.maximum_bytes_billed,
            location: target.location,
        };
    }

    const errs = betterAjvErrors(
        bigqueryTargetJsonSchema,
        target,
        validate.errors || [],
    );

    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
