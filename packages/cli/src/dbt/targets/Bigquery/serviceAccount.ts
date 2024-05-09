import { ParseError } from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { promises as fs } from 'fs';
import { ajv } from '../../../ajv';
import { Target } from '../../types';

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

export const getBigqueryCredentialsFromServiceAccount = async (
    target: Target,
): Promise<Record<string, string>> => {
    const validate = ajv.compile<BigqueryServiceAccountTarget>(
        bigqueryServiceAccountSchema,
    );
    if (validate(target)) {
        const keyfilePath = target.keyfile;
        try {
            return JSON.parse(await fs.readFile(keyfilePath, 'utf8')) as Record<
                string,
                string
            >;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '-';
            throw new ParseError(
                `Cannot read keyfile for bigquery target expect at: ${keyfilePath}:\n  ${msg}`,
            );
        }
    }
    const lineErrorMessages = (validate.errors || [])
        .map((err) => `Field at ${err.instancePath} ${err.message}`)
        .join('\n');
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n  ${lineErrorMessages}`,
    );
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

export const getBigqueryCredentialsFromServiceAccountJson = async (
    target: Target,
): Promise<Record<string, string>> => {
    const validate = ajv.compile<BigqueryServiceAccountJsonTarget>(
        bigqueryServiceAccountJsonSchema,
    );
    if (validate(target)) {
        return Object.entries(target.keyfile_json).reduce<
            Record<string, string>
        >((acc, [key, value]) => {
            if (typeof value === 'string') {
                acc[key] = value
                    .replaceAll(/\s/g, '\n')
                    .replace('BEGIN\nPRIVATE\nKEY', 'BEGIN PRIVATE KEY')
                    .replace('END\nPRIVATE\nKEY', 'END PRIVATE KEY')
                    .replaceAll(/\\n/gm, '\n'); // replace escaped newlines. Prevents error: Error: error:1E08010C:DECODER routines::unsupported
            } else {
                acc[key] = value;
            }
            return acc;
        }, {});
    }
    const lineErrorMessages = (validate.errors || [])
        .map((err) => `Field at ${err.instancePath} ${err.message}`)
        .join('\n');
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n  ${lineErrorMessages}`,
    );
};
