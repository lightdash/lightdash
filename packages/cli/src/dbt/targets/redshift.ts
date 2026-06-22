import {
    CreateRedshiftCredentials,
    ParseError,
    RedshiftAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type RedshiftTarget = {
    type: 'redshift';
    host: string;
    user?: string;
    port: number;
    dbname?: string;
    database?: string;
    schema: string;
    threads?: number;
    pass?: string;
    password?: string;
    keepalives_idle?: number;
    connect_timeout?: number;
    search_path?: string;
    role?: string;
    sslmode?: string;
    method?: string;
    cluster_id?: string;
    region?: string;
    iam_profile?: string;
    autocreate?: boolean;
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
            nullable: true,
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
        method: {
            type: 'string',
            nullable: true,
        },
        cluster_id: {
            type: 'string',
            nullable: true,
        },
        region: {
            type: 'string',
            nullable: true,
        },
        iam_profile: {
            type: 'string',
            nullable: true,
        },
        autocreate: {
            type: 'boolean',
            nullable: true,
        },
    },
    required: ['type', 'host', 'port', 'schema'],
};

export const convertRedshiftSchema = (
    target: Target,
): CreateRedshiftCredentials => {
    const validate = ajv.compile<RedshiftTarget>(redshiftSchema);
    if (validate(target)) {
        const dbname = target.dbname || target.database;
        if (!dbname) {
            throw new ParseError(
                `Redshift target requires a database name: "database"`,
            );
        }

        // IAM authentication: dbt-redshift's connector mints temporary
        // credentials, so no password is present in the profile.
        if (target.method === 'iam') {
            if (!target.region) {
                throw new ParseError(
                    `Redshift IAM target requires a region: "region"`,
                );
            }
            // dbt-redshift represents serverless purely via the host endpoint
            // (no cluster_id); derive the workgroup from it so the connection
            // round-trips to the runtime client correctly.
            const isServerless = target.host.endsWith(
                '.redshift-serverless.amazonaws.com',
            );
            return {
                type: WarehouseTypes.REDSHIFT,
                host: target.host,
                user: target.user ?? '',
                port: target.port,
                dbname,
                schema: target.schema,
                keepalivesIdle: target.keepalives_idle,
                sslmode: target.sslmode,
                authenticationType: RedshiftAuthenticationType.IAM,
                region: target.region,
                isServerless,
                ...(isServerless
                    ? { workgroupName: target.host.split('.')[0] }
                    : { clusterIdentifier: target.cluster_id }),
                autoCreate: target.autocreate,
            };
        }

        const password = target.pass || target.password;
        if (!password) {
            throw new ParseError(
                `Redshift target requires a password: "password"`,
            );
        }
        if (!target.user) {
            throw new ParseError(`Redshift target requires a user: "user"`);
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
