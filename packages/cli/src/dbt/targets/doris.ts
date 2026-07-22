import {
    CreateDorisCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

// dbt-doris profile: https://docs.getdbt.com/docs/local/connect-data-platform/doris-setup
export type DorisTarget = {
    type: 'doris';
    host: string;
    username: string;
    password: string;
    port: number;
    schema: string;
    threads?: number;
};

export const dorisSchema: JSONSchemaType<DorisTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['doris'],
        },
        host: {
            type: 'string',
        },
        username: {
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
        threads: {
            type: 'number',
            nullable: true,
        },
    },
    required: ['type', 'host', 'username', 'password', 'port', 'schema'],
};

export const convertDorisSchema = (
    target: Target,
): CreateDorisCredentials => {
    const validate = ajv.compile<DorisTarget>(dorisSchema);

    if (validate(target)) {
        return {
            type: WarehouseTypes.DORIS,
            host: target.host,
            user: target.username,
            password: target.password,
            port: target.port,
            schema: target.schema,
        };
    }

    const errs = betterAjvErrors(dorisSchema, target, validate.errors || []);
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
