import {
    CreateDatabricksCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

type DatabricksComputeConfig = {
    [name: string]: {
        http_path: string;
    };
};

export type DatabricksTarget = {
    type: 'databricks';
    catalog?: string;
    schema: string;
    host: string;
    http_path: string;
    token: string;
    threads?: number;
    compute?: DatabricksComputeConfig;
};

export const databricksSchema: JSONSchemaType<DatabricksTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['databricks'],
        },
        catalog: {
            type: 'string',
            nullable: true,
        },
        schema: {
            type: 'string',
        },
        host: {
            type: 'string',
        },
        http_path: {
            type: 'string',
        },
        token: {
            type: 'string',
        },
        threads: {
            type: 'number',
            nullable: true,
        },
        compute: {
            type: 'object',
            nullable: true,
            required: [],
            properties: {},
            additionalProperties: {
                type: 'object',
                properties: {
                    http_path: { type: 'string' },
                },
                required: ['http_path'],
                additionalProperties: false,
            },
        },
    },
    required: ['type', 'schema', 'host', 'http_path', 'token'],
};

export const convertDatabricksSchema = (
    target: Target,
): CreateDatabricksCredentials => {
    const validate = ajv.compile<DatabricksTarget>(databricksSchema);
    if (validate(target)) {
        return {
            type: WarehouseTypes.DATABRICKS,
            catalog: target.catalog,
            // this supposed to be a `schema` but changing it will break for existing customers
            database: target.schema,
            serverHostName: target.host,
            httpPath: target.http_path,
            personalAccessToken: target.token,
            compute: Object.entries(target.compute || {}).map(
                ([name, compute]) => ({
                    name,
                    httpPath: compute.http_path,
                }),
            ),
        };
    }
    const errs = betterAjvErrors(
        databricksSchema,
        target,
        validate.errors || [],
    );
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
