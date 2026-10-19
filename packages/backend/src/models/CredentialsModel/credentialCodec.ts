import { type CredentialPurpose, type WarehouseTypes } from '@lightdash/common';
import { z } from 'zod';
import {
    type DecryptionKeySource,
    type EncryptionUtil,
} from '../../utils/EncryptionUtil/EncryptionUtil';

export class CredentialCodecError extends Error {
    constructor(
        public readonly code:
            | 'unknown_mode'
            | 'invalid_identity'
            | 'invalid_secrets'
            | 'invalid_json'
            | 'decryption_failed',
    ) {
        super(`Credential payload could not be processed: ${code}`);
        this.name = 'CredentialCodecError';
    }
}

export type CredentialCodecKey = {
    purpose: CredentialPurpose;
    warehouseType: WarehouseTypes | null;
    authMode: string;
};

const text = z.string();
const nullableText = text.nullable().optional();
const empty = z.object({}).strict();
const user = z.object({ user: text, role: nullableText }).strict();
const password = z.object({ password: text }).strict();
const token = z.object({ token: nullableText }).strict();
const awsIdentity = {
    assumeRoleArn: nullableText,
};
const awsSecrets = {
    accessKeyId: nullableText,
    secretAccessKey: nullableText,
    sessionToken: nullableText,
    assumeRoleExternalId: nullableText,
};
const gitToken = z.object({ token: text }).strict();
const gitIdentity = z.object({ username: nullableText }).strict();
const gitUserIdentity = z
    .object({ providerLogin: text, providerUserId: text })
    .strict();
const dbtGitSecrets = z.object({ personal_access_token: text }).strict();

const registry: Record<
    string,
    {
        identity: z.ZodType<Record<string, unknown>>;
        secrets: z.ZodType<Record<string, unknown>>;
    }
> = {
    'warehouse:snowflake:password': { identity: user, secrets: password },
    'warehouse:snowflake:private_key': {
        identity: user,
        secrets: z
            .object({ privateKey: text, privateKeyPass: nullableText })
            .strict(),
    },
    'warehouse:snowflake:sso': { identity: user, secrets: token },
    'warehouse:snowflake:external_browser': { identity: user, secrets: empty },
    'warehouse:snowflake:oauth_authorization_code': {
        identity: user,
        secrets: token,
    },
    'warehouse:snowflake:none': { identity: user, secrets: empty },
    'warehouse:bigquery:private_key': {
        identity: z
            .object({
                type: z.literal('service_account'),
                client_email: text,
                client_id: nullableText,
                private_key_id: nullableText,
            })
            .strict(),
        secrets: z.object({ private_key: text }).strict(),
    },
    'warehouse:bigquery:sso': {
        identity: z.object({ client_id: nullableText }).strict(),
        secrets: token,
    },
    'warehouse:bigquery:adc': { identity: empty, secrets: empty },
    'warehouse:databricks:personal_access_token': {
        identity: empty,
        secrets: z.object({ personalAccessToken: text }).strict(),
    },
    'warehouse:databricks:oauth_m2m': {
        identity: z.object({ oauthClientId: text }).strict(),
        secrets: z.object({ oauthClientSecret: text }).strict(),
    },
    'warehouse:databricks:oauth_u2m': {
        identity: z.object({ oauthClientId: nullableText }).strict(),
        secrets: token,
    },
    'warehouse:postgres:password': {
        identity: user,
        secrets: z
            .object({
                password: text,
                sslcert: nullableText,
                sslkey: nullableText,
                sslrootcert: nullableText,
            })
            .strict(),
    },
    'warehouse:redshift:password': { identity: user, secrets: password },
    'warehouse:redshift:iam': {
        identity: z.object({ user: text, ...awsIdentity }).strict(),
        secrets: z.object(awsSecrets).strict(),
    },
    'warehouse:redshift:iam_browser': {
        identity: z
            .object({
                user: text,
                awsSsoRoleName: nullableText,
                ...awsIdentity,
            })
            .strict(),
        secrets: z.object(awsSecrets).strict(),
    },
    'warehouse:trino:password': {
        identity: z.object({ user: text }).strict(),
        secrets: password,
    },
    'warehouse:clickhouse:password': {
        identity: z.object({ user: text }).strict(),
        secrets: password,
    },
    'warehouse:athena:access_key': {
        identity: z.object(awsIdentity).strict(),
        secrets: z
            .object({ ...awsSecrets, accessKeyId: text, secretAccessKey: text })
            .strict(),
    },
    'warehouse:athena:iam_role': {
        identity: z.object(awsIdentity).strict(),
        secrets: z.object({ assumeRoleExternalId: nullableText }).strict(),
    },
    'warehouse:athena:web_identity': {
        identity: z
            .object({ assumeRoleArn: text, webIdentityAudience: text })
            .strict(),
        secrets: empty,
    },
    'warehouse:duckdb:token': {
        identity: empty,
        secrets: z.object({ token: text }).strict(),
    },
    'warehouse:duckdb:ducklake': {
        identity: z
            .object({
                catalog: z.object({ user: nullableText }).strict(),
                dataPath: z.object({ accountName: nullableText }).strict(),
            })
            .strict(),
        secrets: z
            .object({
                catalog: z.object({ password: nullableText }).strict(),
                dataPath: z
                    .object({
                        accessKeyId: nullableText,
                        secretAccessKey: nullableText,
                        hmacKeyId: nullableText,
                        hmacSecret: nullableText,
                        connectionString: nullableText,
                        accountKey: nullableText,
                    })
                    .strict(),
            })
            .strict(),
    },
    'warehouse:duckdb:embedded': { identity: empty, secrets: empty },
    'warehouse:duckdb:analytics': { identity: empty, secrets: empty },
    'agent_oauth_client:snowflake:oauth': {
        identity: z.object({ clientId: text }).strict(),
        secrets: z.object({ clientSecret: text }).strict(),
    },
    'ssh_key_pair::key_pair': {
        identity: z.object({ publicKey: text }).strict(),
        secrets: z.object({ privateKey: text }).strict(),
    },
    'git_user::oauth': { identity: gitUserIdentity, secrets: gitToken },
    'git_user::personal_access_token': {
        identity: gitUserIdentity,
        secrets: gitToken,
    },
    'git_installation::github': {
        identity: empty,
        secrets: z.object({ installationId: text, token: text }).strict(),
    },
    'git_installation::gitlab': {
        identity: empty,
        secrets: z.object({ installationId: text, token: text }).strict(),
    },
    'dbt_cloud::api_key': {
        identity: empty,
        secrets: z
            .object({ api_key: text, webhook_hmac_secret: nullableText })
            .strict(),
    },
    'dbt_git::personal_access_token': {
        identity: gitIdentity,
        secrets: dbtGitSecrets,
    },
    'dbt_git::installation_id': {
        identity: empty,
        secrets: z.object({ installation_id: text }).strict(),
    },
    'dbt_environment::environment': {
        identity: empty,
        secrets: z
            .object({
                environment: z.array(
                    z.object({ key: text, value: text }).strict(),
                ),
            })
            .strict(),
    },
    'external_source::oauth': { identity: empty, secrets: token },
};

const warehousePurposes: readonly CredentialPurpose[] = [
    'shared_login',
    'ai_service_account',
    'delivery_service_account',
    'embed_service_account',
    'automation_service_account',
    'personal_sign_in',
    'agent_sign_in',
];

const getSchemas = ({
    purpose,
    warehouseType,
    authMode,
}: CredentialCodecKey) => {
    const family = warehousePurposes.includes(purpose) ? 'warehouse' : purpose;
    const schemas = registry[`${family}:${warehouseType ?? ''}:${authMode}`];
    if (!schemas) throw new CredentialCodecError('unknown_mode');
    return schemas;
};

const validate = <T>(
    schema: z.ZodType<T>,
    value: unknown,
    code: 'invalid_identity' | 'invalid_secrets',
): T => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new CredentialCodecError(code);
    return parsed.data;
};

export class CredentialCodec {
    constructor(private readonly encryptionUtil: EncryptionUtil) {}

    encodeCredential(
        input: CredentialCodecKey & { identity: unknown; secrets: unknown },
    ): { identity: Record<string, unknown>; encryptedSecrets: Buffer } {
        const schemas = getSchemas(input);
        const identity = validate(
            schemas.identity,
            input.identity,
            'invalid_identity',
        );
        const secrets = validate(
            schemas.secrets,
            input.secrets,
            'invalid_secrets',
        );
        return {
            identity,
            encryptedSecrets: this.encryptionUtil.encrypt(
                JSON.stringify(secrets),
            ),
        };
    }

    decodeSecrets(
        row: CredentialCodecKey,
        encryptedSecrets: Buffer,
    ): { secrets: Record<string, unknown>; keySource: DecryptionKeySource } {
        const schemas = getSchemas(row);
        const { value, keySource } = this.decryptJson(encryptedSecrets);
        return {
            secrets: validate(schemas.secrets, value, 'invalid_secrets'),
            keySource,
        };
    }

    encodeRefreshToken(refreshToken: string): Buffer {
        const value = validate(
            z.object({ refreshToken: text }).strict(),
            { refreshToken },
            'invalid_secrets',
        );
        return this.encryptionUtil.encrypt(JSON.stringify(value));
    }

    decodeRefreshToken(encryptedRefreshToken: Buffer): {
        refreshToken: string;
        keySource: DecryptionKeySource;
    } {
        const { value, keySource } = this.decryptJson(encryptedRefreshToken);
        const parsed = validate(
            z.object({ refreshToken: text }).strict(),
            value,
            'invalid_secrets',
        );
        return { ...parsed, keySource };
    }

    private decryptJson(ciphertext: Buffer): {
        value: unknown;
        keySource: DecryptionKeySource;
    } {
        let decrypted;
        try {
            decrypted = this.encryptionUtil.decryptWithMeta(ciphertext);
        } catch {
            throw new CredentialCodecError('decryption_failed');
        }
        try {
            return {
                value: JSON.parse(decrypted.value),
                keySource: decrypted.keySource,
            };
        } catch {
            throw new CredentialCodecError('invalid_json');
        }
    }
}
