import {
    CreateSnowflakeCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { promises as fs } from 'fs';
import { ajv } from '../../ajv';
import { Target } from '../types';

type SnowflakeTarget = {
    type: 'snowflake';
    account: string;
    user: string;
    password?: string;
    private_key_path?: string;
    private_key_passphrase?: string;
    role: string;
    database: string;
    warehouse: string;
    schema: string;
    threads: number;
    client_session_keep_alive?: boolean;
    query_tag?: string;
    connect_retries?: number;
    connect_timeout?: number;
    retry_on_database_errors?: boolean;
    retry_all?: boolean;
};

const snowflakeSchema: JSONSchemaType<SnowflakeTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['snowflake'],
        },
        account: {
            type: 'string',
        },
        user: {
            type: 'string',
        },
        password: {
            type: 'string',
            nullable: true,
        },
        private_key_path: {
            type: 'string',
            nullable: true,
        },
        private_key_passphrase: {
            type: 'string',
            nullable: true,
        },
        role: {
            type: 'string',
        },
        database: {
            type: 'string',
        },
        warehouse: {
            type: 'string',
        },
        schema: {
            type: 'string',
        },
        threads: {
            type: 'integer',
            nullable: true,
        },
        client_session_keep_alive: {
            type: 'boolean',
            nullable: true,
        },
        query_tag: {
            type: 'string',
            nullable: true,
        },
        connect_retries: {
            type: 'integer',
            nullable: true,
        },
        connect_timeout: {
            type: 'integer',
            nullable: true,
        },
        retry_on_database_errors: {
            type: 'boolean',
            nullable: true,
        },
        retry_all: {
            type: 'boolean',
            nullable: true,
        },
    },
    required: [
        'type',
        'account',
        'user',
        'role',
        'database',
        'warehouse',
        'schema',
    ],
};

export const convertSnowflakeSchema = async (
    target: Target,
): Promise<CreateSnowflakeCredentials> => {
    const validate = ajv.compile<SnowflakeTarget>(snowflakeSchema);
    if (validate(target)) {
        const keyfilePath = target.private_key_path;
        let privateKey;
        if (keyfilePath) {
            try {
                privateKey = await fs.readFile(keyfilePath, 'utf8');
            } catch (e: any) {
                throw new ParseError(
                    `Cannot read keyfile for snowflake target at: ${keyfilePath}:\n  ${e.message}`,
                );
            }
        }

        return {
            type: WarehouseTypes.SNOWFLAKE,
            account: target.account,
            user: target.user,
            password: target.password,
            privateKey,
            privateKeyPass: target.private_key_passphrase,
            role: target.role,
            warehouse: target.warehouse,
            database: target.database,
            schema: target.schema,
            clientSessionKeepAlive: target.client_session_keep_alive,
            queryTag: target.query_tag,
        };
    }
    const lineErrorMessages = (validate.errors || [])
        .map((err) => `Field at ${err.instancePath} ${err.message}`)
        .join('\n');
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n  ${lineErrorMessages}`,
    );
};
