import {
    CreateSnowflakeCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type SnowflakeUserPasswordTarget = {
    type: 'snowflake';
    account: string;
    user: string;
    password: string;
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

export const snowflakeUserPasswordSchema: JSONSchemaType<SnowflakeUserPasswordTarget> =
    {
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
            'password',
            'role',
            'database',
            'warehouse',
            'schema',
        ],
    };

export const convertSnowflakeSchema = (
    target: Target,
): CreateSnowflakeCredentials => {
    const validate = ajv.compile<SnowflakeUserPasswordTarget>(
        snowflakeUserPasswordSchema,
    );
    if (validate(target)) {
        return {
            type: WarehouseTypes.SNOWFLAKE,
            account: target.account,
            user: target.user,
            password: target.password,
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
