import {
    CreateBigqueryCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { promises as fs } from 'fs';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type BigqueryServiceAccountTarget = {
    type: 'bigquery';
    project: string;
    dataset: string;
    threads: number;
    method: string;
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

export const convertBigquerySchema = async (
    target: Target,
): Promise<CreateBigqueryCredentials> => {
    if (target.method !== 'service-account' && target.method !== 'oauth') {
        throw new ParseError(
            `BigQuery method ${target.method} is not yet supported`,
        );
    }
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
