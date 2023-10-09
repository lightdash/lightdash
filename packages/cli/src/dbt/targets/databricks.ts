import {
    CreateDatabricksCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type DatabricksTarget = {
    type: 'databricks';
    catalog?: string;
    schema: string;
    host: string;
    http_path: string;
    token: string;
    threads?: number;
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
