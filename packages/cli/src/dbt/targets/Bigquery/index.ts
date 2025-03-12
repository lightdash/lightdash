import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
    WarehouseConnectionError,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { OAuth2ClientOptions } from 'google-auth-library';
import { ajv } from '../../../ajv';
import { Target } from '../../types';
import { getBigqueryCredentialsFromOauth } from './oauth';
import { getBigqueryCredentialsFromOauthSecrets } from './oauthSecrets';
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
    execution_project?: string;
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
        execution_project: {
            type: 'string',
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
    let getKeyfileContents : (target: Target) => Promise<Record<string, string>> | Promise<OAuth2ClientOptions>;
    if (validate(target)) {
        switch (target.method) {
            case 'oauth':
                getKeyfileContents = getBigqueryCredentialsFromOauth;
                break;
            case 'service-account':
                getKeyfileContents =
                    getBigqueryCredentialsFromServiceAccount;
                break;
            case 'service-account-json':
                getKeyfileContents =
                    getBigqueryCredentialsFromServiceAccountJson;
                break;
            case 'oauth-secrets':
                getKeyfileContents = getBigqueryCredentialsFromOauthSecrets;
                break;
            default:
                throw new ParseError(
                    `BigQuery method ${target.method} is not yet supported`,
                );
        }

        if (target.project === undefined && target.method !== 'oauth') {
            throw new ParseError(
                `BigQuery project is required for ${target.method} authentication method`,
            );
        }

        const creds: CreateBigqueryCredentials = {
            type: WarehouseTypes.BIGQUERY,
            project: target.project || '',
            dataset: target.dataset || target.schema,
            timeoutSeconds: target.timeout_seconds,
            priority: target.priority,
            retries: target.retries,
            maximumBytesBilled: target.maximum_bytes_billed,
            location: target.location,
            executionProject: target.execution_project,
        };

        if (getKeyfileContents) {
            const keyfile = await getKeyfileContents(target);

            if ('credentials' in keyfile) {
                creds.authClientOptions = keyfile;
            } else {
                creds.keyfileContents = keyfile as Record<string, string>;
            }
        }

        return creds;
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
