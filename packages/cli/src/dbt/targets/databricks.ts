import {
    CreateDatabricksCredentials,
    DatabricksAuthenticationType,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

type DatabricksComputeConfig = {
    [name: string]: {
        http_path: string;
    };
};

export type DatabricksTarget = {
    type: 'databricks';
    catalog?: string;
    schema: string;
    host: string;
    http_path: string;
    // PAT authentication
    token?: string;
    // oauth can reference either M2M or U2M
    auth_type?: 'token' | 'oauth';
    client_id?: string;
    // OAuth M2M fields
    client_secret?: string;
    // OAuth U2M fields (optional - tokens kept in memory)
    access_token?: string;
    refresh_token?: string;
    threads?: number;
    compute?: DatabricksComputeConfig;
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
            nullable: true,
        },
        auth_type: {
            type: 'string',
            enum: ['token', 'oauth'],
            nullable: true,
        },
        client_id: {
            type: 'string',
            nullable: true,
        },
        client_secret: {
            type: 'string',
            nullable: true,
        },
        access_token: {
            type: 'string',
            nullable: true,
        },
        refresh_token: {
            type: 'string',
            nullable: true,
        },
        oauth_client_id: {
            type: 'string',
            nullable: true,
        },
        threads: {
            type: 'number',
            nullable: true,
        },
        compute: {
            type: 'object',
            nullable: true,
            required: [],
            properties: {},
            additionalProperties: {
                type: 'object',
                properties: {
                    http_path: { type: 'string' },
                },
                required: ['http_path'],
                additionalProperties: false,
            },
        },
    },
    required: ['type', 'schema', 'host', 'http_path'],
};

export const convertDatabricksSchema = (
    target: Target,
): CreateDatabricksCredentials => {
    const validate = ajv.compile<DatabricksTarget>(databricksSchema);
    if (!validate(target)) {
        const errs = betterAjvErrors(
            databricksSchema,
            target,
            validate.errors || [],
        );
        throw new ParseError(
            `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
        );
    }

    const authType = target.auth_type || 'token';

    // OAuth authentication
    if (authType === 'oauth') {
        // Determine authentication type: check env var first, then auto-detect
        let authenticationType: DatabricksAuthenticationType;

        const databricksOAuthEnv = process.env.DATABRICKS_OAUTH?.toLowerCase();

        if (databricksOAuthEnv === 'u2m') {
            // Force U2M (user-to-machine) - browser-based OAuth
            authenticationType = DatabricksAuthenticationType.OAUTH_U2M;
        } else {
            // Auto-detect based on presence of client credentials
            // If both client_id and client_secret are present, assume M2M
            // Otherwise, assume U2M (which uses PKCE and doesn't require secret)
            authenticationType =
                target.client_secret && target.client_id
                    ? DatabricksAuthenticationType.OAUTH_M2M
                    : DatabricksAuthenticationType.OAUTH_U2M;
        }

        const clientId = target.client_id || 'dbt-databricks'; // Use the same default dbt client for databricks

        return {
            type: WarehouseTypes.DATABRICKS,
            authenticationType,
            catalog: target.catalog,
            database: target.schema,
            serverHostName: target.host,
            httpPath: target.http_path,
            oauthClientId: clientId,
            oauthClientSecret: target.client_secret,
            compute: Object.entries(target.compute || {}).map(
                ([name, compute]) => ({
                    name,
                    httpPath: compute.http_path,
                }),
            ),
        };
    }

    // Personal Access Token authentication (default)
    if (!target.token) {
        throw new ParseError(
            'Databricks token is required when not using OAuth authentication',
        );
    }

    return {
        type: WarehouseTypes.DATABRICKS,
        authenticationType: DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
        catalog: target.catalog,
        database: target.schema,
        serverHostName: target.host,
        httpPath: target.http_path,
        personalAccessToken: target.token,
        compute: Object.entries(target.compute || {}).map(
            ([name, compute]) => ({
                name,
                httpPath: compute.http_path,
            }),
        ),
    };
};
