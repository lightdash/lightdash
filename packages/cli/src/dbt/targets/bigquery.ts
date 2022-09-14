import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { promises as fs } from 'fs';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type BigqueryServiceAccountTarget = {
    type: 'bigquery';
    project: string;
    dataset: string;
    threads: number;
    method: 'service-account' | 'oauth';
    keyfile: string;
    priority?: 'interactive' | 'batch';
    retries?: number;
    location?: string;
    maximum_bytes_billed?: number;
    timeout_seconds?: number;
};
export const bigqueryServiceAccountSchema: JSONSchemaType<BigqueryServiceAccountTarget> =
    {
        type: 'object',
        properties: {
            type: {
                type: 'string',
                enum: ['bigquery'],
            },
            project: {
                type: 'string',
            },
            dataset: {
                type: 'string',
            },
            threads: {
                type: 'integer',
                minimum: 1,
                nullable: true,
            },
            method: {
                type: 'string',
                enum: ['service-account', 'oauth'],
            },
            keyfile: {
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
        required: ['type', 'project', 'dataset', 'method', 'keyfile'],
    };

export type BigqueryServiceAccountJsonTarget = {
    type: 'bigquery';
    method: 'service-account-json';
    project: string;
    dataset: string;
    threads: number;
    keyfile_json: object;
    priority?: 'interactive' | 'batch';
    retries?: number;
    location?: string;
    maximum_bytes_billed?: number;
    timeout_seconds?: number;
};
export const bigqueryServiceAccountJsonSchema: JSONSchemaType<BigqueryServiceAccountJsonTarget> =
    {
        type: 'object',
        properties: {
            type: {
                type: 'string',
                enum: ['bigquery'],
            },
            project: {
                type: 'string',
            },
            dataset: {
                type: 'string',
            },
            threads: {
                type: 'integer',
                minimum: 1,
                nullable: true,
            },
            method: {
                type: 'string',
                enum: ['service-account-json'],
            },
            keyfile_json: {
                type: 'object',
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
        required: ['type', 'project', 'dataset', 'method', 'keyfile_json'],
    };

const getBigqueryCredentialsFromOauth = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    const auth = new GoogleAuth();
    const credentials = await auth.getApplicationDefault();

    if (credentials.credential instanceof UserRefreshClient) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { _clientId, _clientSecret, _refreshToken } =
            credentials.credential;
        if (_clientId && _clientSecret && _refreshToken) {
            return {
                type: WarehouseTypes.BIGQUERY,
                project: target.project,
                dataset: target.dataset,
                timeoutSeconds: target.timeout_seconds,
                priority: target.priority,
                keyfileContents: {
                    client_id: _clientId,
                    client_secret: _clientSecret,
                    refresh_token: _refreshToken,
                    type: 'authorized_user',
                },
                retries: target.retries,
                location: target.location,
                maximumBytesBilled: target.maximum_bytes_billed,
            };
        }
        throw new ParseError(`Cannot get credentials from UserRefreshClient`);
    }
    throw new ParseError(`Cannot get credentials from oauth`);
};

const getBigqueryCredentialsFromServiceAccount = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    const validate = ajv.compile<BigqueryServiceAccountTarget>(
        bigqueryServiceAccountSchema,
    );
    if (validate(target)) {
        const keyfilePath = target.keyfile;
        let keyfile;
        try {
            keyfile = JSON.parse(
                await fs.readFile(keyfilePath, 'utf8'),
            ) as Record<string, string>;
        } catch (e: any) {
            throw new ParseError(
                `Cannot read keyfile for bigquery target expect at: ${keyfilePath}:\n  ${e.message}`,
            );
        }
        return {
            type: WarehouseTypes.BIGQUERY,
            project: target.project,
            dataset: target.dataset,
            timeoutSeconds: target.timeout_seconds,
            priority: target.priority,
            keyfileContents: keyfile,
            retries: target.retries,
            location: target.location,
            maximumBytesBilled: target.maximum_bytes_billed,
        };
    }
    const lineErrorMessages = (validate.errors || [])
        .map((err) => `Field at ${err.instancePath} ${err.message}`)
        .join('\n');
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n  ${lineErrorMessages}`,
    );
};

const getBigqueryCredentialsFromServiceAccountJson = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    const validate = ajv.compile<BigqueryServiceAccountJsonTarget>(
        bigqueryServiceAccountJsonSchema,
    );
    if (validate(target)) {
        return {
            type: WarehouseTypes.BIGQUERY,
            project: target.project,
            dataset: target.dataset,
            timeoutSeconds: target.timeout_seconds,
            priority: target.priority,
            keyfileContents: target.keyfile_json as Record<string, string>,
            retries: target.retries,
            location: target.location,
            maximumBytesBilled: target.maximum_bytes_billed,
        };
    }
    const lineErrorMessages = (validate.errors || [])
        .map((err) => `Field at ${err.instancePath} ${err.message}`)
        .join('\n');
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n  ${lineErrorMessages}`,
    );
};

export const convertBigquerySchema = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    switch (target.method) {
        case 'oauth':
            return getBigqueryCredentialsFromOauth(target);
        case 'service-account':
            return getBigqueryCredentialsFromServiceAccount(target);
        case 'service-account-json':
            return getBigqueryCredentialsFromServiceAccountJson(target);
        default:
            throw new ParseError(
                `BigQuery method ${target.method} is not yet supported`,
            );
    }
};
