import { ParseError } from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import { OAuth2ClientOptions } from 'google-auth-library';
import { ajv } from '../../../ajv';
import { Target } from '../../types';

export type BigqueryOauthSecretsTarget = {
    type: 'bigquery';
    method: 'oauth-secrets';
    project?: string; // Optional, as per docs
    dataset: string;
    threads: number;
    token?: string; // For temporary tokens
    refresh_token?: string; // For refresh tokens
    client_id?: string;
    client_secret?: string;
    priority?: 'interactive' | 'batch';
    location?: string;
    execution_project?: string;
};

const bigqueryOauthSecretsSchema: JSONSchemaType<BigqueryOauthSecretsTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['bigquery'],
        },
        method: {
            type: 'string',
            enum: ['oauth-secrets'],
        },
        project: {
            type: 'string',
            nullable: true,
        },
        dataset: {
            type: 'string',
        },
        threads: {
            type: 'integer',
            minimum: 1,
            nullable: true,
        },
        token: {
            type: 'string',
            nullable: true,
        },
        refresh_token: {
            type: 'string',
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
        priority: {
            type: 'string',
            enum: ['interactive', 'batch'],
            nullable: true,
        },
        location: {
            type: 'string',
            nullable: true,
        },
        execution_project: {
            type: 'string',
            nullable: true,
        },
    },
    required: ['type', 'dataset', 'method', 'threads'],
};

export const getBigqueryCredentialsFromOauthSecrets = async (
    target: Target,
): Promise<OAuth2ClientOptions> => {
    const validate = ajv.compile<BigqueryOauthSecretsTarget>(
        bigqueryOauthSecretsSchema,
    );

    if (validate(target)) {
        return {
            credentials: {
                access_token: target.token,
                refresh_token: target.refresh_token,
            },
            clientId: target.client_id,
            clientSecret: target.client_secret,
        };
    }

    const lineErrorMessages = (validate.errors || [])
        .map((err) => `Field at ${err.instancePath} ${err.message}`)
        .join('\n');
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n  ${lineErrorMessages}`,
    );
};
