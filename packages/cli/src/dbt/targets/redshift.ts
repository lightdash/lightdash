import {
    CreateRedshiftCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type RedshiftTarget = {
    type: 'redshift';
    host: string;
    user: string;
    port: number;
    dbname?: string;
    database?: string;
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

export const redshiftSchema: JSONSchemaType<RedshiftTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['redshift'],
        },
        host: {
            type: 'string',
        },
        user: {
            type: 'string',
        },
        port: {
            type: 'integer',
        },
        dbname: {
            type: 'string',
            nullable: true,
        },
        database: {
            type: 'string',
            nullable: true,
        },
        schema: {
            type: 'string',
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
    required: ['type', 'host', 'user', 'port', 'schema'],
};

export const convertRedshiftSchema = (
    target: Target,
): CreateRedshiftCredentials => {
    const validate = ajv.compile<RedshiftTarget>(redshiftSchema);
    if (validate(target)) {
        const password = target.pass || target.password;
        if (!password) {
            throw new ParseError(
                `Redshift target requires a password: "password"`,
            );
        }
        const dbname = target.dbname || target.database;
        if (!dbname) {
            throw new ParseError(
                `Redshift target requires a database name: "database"`,
            );
        }
        return {
            type: WarehouseTypes.REDSHIFT,
            host: target.host,
            user: target.user,
            password,
            port: target.port,
            dbname,
            schema: target.schema,
            keepalivesIdle: target.keepalives_idle,
            sslmode: target.sslmode,
        };
    }
    const errs = betterAjvErrors(redshiftSchema, target, validate.errors || []);
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
