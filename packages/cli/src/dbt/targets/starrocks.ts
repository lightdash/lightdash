import {
    CreateStarrocksCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type StarrocksTarget = {
    type: 'starrocks';
    host: string;
    username: string;
    port: number;
    catalog?: string;
    schema: string;
    threads: number;
    pass?: string;
    password?: string;
    keepalives_idle?: number;
    connect_timeout?: number;
    search_path?: string;
    role?: string;
    sslmode?: string;
};

export const starrocksSchema: JSONSchemaType<StarrocksTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['starrocks'],
        },
        host: {
            type: 'string',
        },
        username: {
            type: 'string',
        },
        port: {
            type: 'integer',
        },
        schema: {
            type: 'string',
        },
        catalog: {
            type: 'string',
            nullable: true,
        },
        threads: {
            type: 'integer',
            nullable: true,
        },
        pass: {
            type: 'string',
            nullable: true,
        },
        password: {
            type: 'string',
            nullable: true,
        },
        keepalives_idle: {
            type: 'integer',
            nullable: true,
        },
        connect_timeout: {
            type: 'integer',
            nullable: true,
        },
        search_path: {
            type: 'string',
            nullable: true,
        },
        role: {
            type: 'string',
            nullable: true,
        },
        sslmode: {
            type: 'string',
            nullable: true,
        },
    },
    required: ['type', 'host', 'username', 'port', 'schema'],
};

export const convertStarrocksSchema = (
    target: Target,
): CreateStarrocksCredentials => {
    const validate = ajv.compile<StarrocksTarget>(starrocksSchema);
    if (validate(target)) {        
        return {
            type: WarehouseTypes.STARROCKS,
            host: target.host,
            user: target.username,
            password: target.password,
            port: target.port,
            schema: target.schema,
            catalog: target.catalog || 'default_catalog', 
        };
    }
    const errs = betterAjvErrors(starrocksSchema, target, validate.errors || []);
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
