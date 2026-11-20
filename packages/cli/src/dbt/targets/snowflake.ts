import {
    CreateSnowflakeCredentials,
    getErrorMessage,
    ParseError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import betterAjvErrors from '@sidvind/better-ajv-errors';
import { JSONSchemaType } from 'ajv';
import { promises as fs } from 'fs';
import { ajv } from '../../ajv';
import { Target } from '../types';

type SnowflakeTarget = {
    type: 'snowflake';
    account: string;
    user?: string;
    password?: string;
    authenticator?: string;
    token?: string;
    oauth_client_id?: string;
    oauth_client_secret?: string;
    private_key_path?: string;
    private_key?: string;
    private_key_passphrase?: string;
    role?: string;
    database: string;
    warehouse: string;
    schema: string;
    threads?: number;
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
            nullable: true,
        },
        password: {
            type: 'string',
            nullable: true,
        },
        authenticator: {
            type: 'string',
            nullable: true,
        },
        token: {
            type: 'string',
            nullable: true,
        },
        oauth_client_id: {
            type: 'string',
            nullable: true,
        },
        oauth_client_secret: {
            type: 'string',
            nullable: true,
        },
        private_key_path: {
            type: 'string',
            nullable: true,
        },
        private_key: {
            type: 'string',
            nullable: true,
        },
        private_key_passphrase: {
            type: 'string',
            nullable: true,
        },
        role: {
            type: 'string',
            nullable: true,
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
    required: ['type', 'account', 'database', 'warehouse', 'schema'],
};

const SKIP_FLAGS_HINT =
    'To continue without a warehouse connection, use --skip-warehouse-catalog (deploy also needs --no-warehouse-credentials when creating a project).';

const unsupportedAuthError = (reason: string) =>
    new ParseError(
        `Lightdash CLI can't connect to Snowflake with this profile: ${reason}\n${SKIP_FLAGS_HINT}`,
    );

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
            } catch (e: unknown) {
                const msg = getErrorMessage(e);
                throw new ParseError(
                    `Cannot read keyfile for snowflake target at: ${keyfilePath}:\n  ${msg}`,
                );
            }
        }
        if (target.private_key) {
            privateKey = target.private_key;
        }

        const authenticator = target.authenticator?.toLowerCase();
        const common = {
            type: WarehouseTypes.SNOWFLAKE as const,
            account: target.account,
            role: target.role,
            warehouse: target.warehouse,
            database: target.database,
            schema: target.schema,
            clientSessionKeepAlive: target.client_session_keep_alive,
            queryTag: target.query_tag,
        };

        if (authenticator === 'oauth') {
            if (target.oauth_client_id || target.oauth_client_secret) {
                // dbt treats `token` as a refresh token here; we don't exchange it
                throw unsupportedAuthError(
                    '"authenticator: oauth" with oauth_client_id / oauth_client_secret (refresh token) is not supported. Set "token" to an OAuth access token and remove the client id and secret.',
                );
            }
            if (!target.token) {
                throw unsupportedAuthError(
                    '"authenticator: oauth" needs "token" set to an OAuth access token.',
                );
            }
            return {
                ...common,
                user: target.user ?? '',
                authenticationType: SnowflakeAuthenticationType.SSO,
                token: target.token,
            };
        }

        if (!target.user) {
            throw new ParseError(
                `Couldn't read profiles.yml file for ${target.type}:\n"user" is required`,
            );
        }

        // Determine authentication type based on authenticator field or credentials present
        let authenticationType: SnowflakeAuthenticationType;
        if (authenticator === 'externalbrowser') {
            authenticationType = SnowflakeAuthenticationType.EXTERNAL_BROWSER;
        } else if (privateKey) {
            authenticationType = SnowflakeAuthenticationType.PRIVATE_KEY;
        } else if (target.password) {
            authenticationType = SnowflakeAuthenticationType.PASSWORD;
        } else {
            throw unsupportedAuthError(
                target.authenticator
                    ? `"authenticator: ${target.authenticator}" is not supported without a password or private key.`
                    : 'no password, private key or supported authenticator found.',
            );
        }

        return {
            ...common,
            user: target.user,
            password: target.password,
            privateKey,
            privateKeyPass: target.private_key_passphrase,
            authenticationType,
        };
    }

    const errs = betterAjvErrors(
        snowflakeSchema,
        target,
        validate.errors || [],
    );

    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
