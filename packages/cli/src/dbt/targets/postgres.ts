import {
    CreatePostgresCredentials,
    ParameterError,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { readFile } from 'fs/promises';
import { ajv } from '../../ajv';
import GlobalState from '../../globalState';
import { Target } from '../types';

export type PostgresTarget = {
    type: 'postgres';
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
    sslcert?: string;
    sslkey?: string;
    sslrootcert?: string;
};

export const postgresSchema: JSONSchemaType<PostgresTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['postgres'],
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
        sslcert: {
            type: 'string',
            nullable: true,
        },
        sslkey: {
            type: 'string',
            nullable: true,
        },
        sslrootcert: {
            type: 'string',
            nullable: true,
        },
    },
    required: ['type', 'host', 'user', 'port', 'schema'],
};

const readFileOrThrow = (fileType: string, path: string) => {
    GlobalState.debug(`> Reading file ${path} for ${fileType}`);
    return readFile(path)
        .then((file) => file.toString('utf-8'))
        .catch((err) => {
            throw new ParameterError(
                `Postgres target requires ${fileType}, Error reading provided file:\n\t${err.code} ${path}`,
            );
        });
};

export const convertPostgresSchema = async (
    target: Target,
): Promise<CreatePostgresCredentials> => {
    const validate = ajv.compile<PostgresTarget>(postgresSchema);
    if (!validate(target)) {
        const errs = betterAjvErrors(
            postgresSchema,
            target,
            validate.errors || [],
        );
        throw new ParseError(
            `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
        );
    }

    let sslcertFile: string | undefined;
    let sslkeyFile: string | undefined;
    let sslrootcertFile: string | undefined;
    if (target.sslmode === 'verify-full') {
        if (!target.sslcert || !target.sslkey || !target.sslrootcert) {
            throw new ParseError(
                `Postgres target requires sslcert, sslkey and sslrootcert when sslmode is "verify-full"`,
            );
        }

        [sslcertFile, sslkeyFile, sslrootcertFile] = await Promise.all([
            readFileOrThrow('sslcert', target.sslcert),
            readFileOrThrow('sslkey', target.sslkey),
            readFileOrThrow('sslrootcert', target.sslrootcert),
        ]);
    }
    if (target.sslmode === 'verify-ca') {
        if (!target.sslrootcert) {
            throw new ParseError(
                `Postgres target requires sslrootcert when sslmode is "verify-ca"`,
            );
        }
        sslrootcertFile = await readFileOrThrow(
            'sslrootcert',
            target.sslrootcert,
        );
    }

    const password = target.pass || target.password;
    if (!password) {
        throw new ParseError(`Postgres target requires a password: "password"`);
    }
    const dbname = target.dbname || target.database;
    if (!dbname) {
        throw new ParseError(
            `Postgres target requires a database name: "database"`,
        );
    }
    return {
        type: WarehouseTypes.POSTGRES,
        host: target.host,
        user: target.user,
        password,
        port: target.port,
        dbname,
        schema: target.schema,
        keepalivesIdle: target.keepalives_idle,
        searchPath: target.search_path,
        role: target.role,
        sslmode: target.sslmode,
        sslcert: sslcertFile,
        sslkey: sslkeyFile,
        sslrootcert: sslrootcertFile,
    };
};
