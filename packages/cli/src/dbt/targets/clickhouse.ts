import {
    CreateClickhouseCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type ClickhouseTarget = {
    type: 'clickhouse';
    host: string;
    user: string;
    password: string;
    port: number;
    schema: string;
    driver?: string;
    cluster?: string;
    verify?: boolean;
    secure?: boolean;
    retries?: number;
    compression?: boolean;
    connect_timeout?: number;
    send_receive_timeout?: number;
    cluster_mode?: boolean;
    custom_settings?: Record<string, unknown>;
};

export const clickhouseSchema: JSONSchemaType<ClickhouseTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['clickhouse'],
        },
        host: {
            type: 'string',
        },
        user: {
            type: 'string',
        },
        password: {
            type: 'string',
        },
        port: {
            type: 'number',
        },
        schema: {
            type: 'string',
        },
        driver: {
            type: 'string',
            nullable: true,
        },
        cluster: {
            type: 'string',
            nullable: true,
        },
        verify: {
            type: 'boolean',
            nullable: true,
        },
        secure: {
            type: 'boolean',
            nullable: true,
        },
        retries: {
            type: 'number',
            nullable: true,
        },
        compression: {
            type: 'boolean',
            nullable: true,
        },
        connect_timeout: {
            type: 'number',
            nullable: true,
        },
        send_receive_timeout: {
            type: 'number',
            nullable: true,
        },
        cluster_mode: {
            type: 'boolean',
            nullable: true,
        },
        custom_settings: {
            type: 'object',
            nullable: true,
        },
    },
    required: ['type', 'host', 'user', 'password', 'port', 'schema'],
};

export const convertClickhouseSchema = (
    target: Target,
): CreateClickhouseCredentials => {
    const validate = ajv.compile<ClickhouseTarget>(clickhouseSchema);

    if (validate(target)) {
        return {
            type: WarehouseTypes.CLICKHOUSE,
            host: target.host,
            user: target.user,
            password: target.password,
            port: target.port,
            schema: target.schema,
            secure: target.secure ?? true,
            timeoutSeconds: target.send_receive_timeout,
        };
    }

    const errs = betterAjvErrors(
        clickhouseSchema,
        target,
        validate.errors || [],
    );
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
