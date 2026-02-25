import {
    CreateDuckdbCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type DuckdbTarget = {
    type: 'duckdb';
    path: string;
    schema: string;
    threads?: number;
    extensions?: string[];
    settings?: {
        motherduck_token?: string;
    };
};

export const duckdbSchema: JSONSchemaType<DuckdbTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['duckdb'],
        },
        path: {
            type: 'string',
        },
        schema: {
            type: 'string',
        },
        threads: {
            type: 'number',
            nullable: true,
        },
        extensions: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
        },
        settings: {
            type: 'object',
            properties: {
                motherduck_token: {
                    type: 'string',
                    nullable: true,
                },
            },
            nullable: true,
        },
    },
    required: ['type', 'path', 'schema'],
};

export const convertDuckdbSchema = (
    target: Target,
): CreateDuckdbCredentials => {
    const validate = ajv.compile<DuckdbTarget>(duckdbSchema);

    if (validate(target)) {
        // Strip `md:` prefix from path to get the database name
        const database = target.path.startsWith('md:')
            ? target.path.slice(3)
            : target.path;

        return {
            type: WarehouseTypes.DUCKDB,
            database,
            schema: target.schema,
            token: target.settings?.motherduck_token || undefined,
            threads: target.threads,
        };
    }

    const errs = betterAjvErrors(duckdbSchema, target, validate.errors || []);
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
