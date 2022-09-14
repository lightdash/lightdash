import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { promises as fs } from 'fs';
import { GoogleAuth } from 'google-auth-library';
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

const getBigueryCredentialsFromOauth = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    const auth = new GoogleAuth();
    const client = await auth.getClient();
    const projectId = target.project; // await auth.getProjectId();
    const url = `https://dns.googleapis.com/dns/v1/projects/${projectId}`;
    const res = await client.request({ url });
    console.log(res.data);
    throw new ParseError(`Cannot get credentials from oauth`);
};

const getBigueryCredentialsFromServiceAccount = async (
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

const getBigueryCredentialsFromServiceAccountJson = async (
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
            return getBigueryCredentialsFromOauth(target);
        case 'service-account':
            return getBigueryCredentialsFromServiceAccount(target);
        case 'service-account-json':
            return getBigueryCredentialsFromServiceAccountJson(target);
        default:
            throw new ParseError(
                `BigQuery method ${target.method} is not yet supported`,
            );
    }
};
