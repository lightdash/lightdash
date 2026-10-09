import {
    assertUnreachable,
    assertValidBigqueryKeyfile,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    ParameterError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
} from '@lightdash/common';
import { type Knex } from 'knex';
import isEqual from 'lodash/isEqual';
import { createPrivateKey, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
    AiServiceAccountCredentialsTableName,
    type DbAiServiceAccountCredentials,
} from '../../database/entities/aiServiceAccountCredentials';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

const bigqueryCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.BIGQUERY),
        authenticationType: z.literal(BigqueryAuthenticationType.PRIVATE_KEY),
        keyfileContents: z.record(z.string(), z.string()),
    })
    .strict();

const nonEmptyIdentifier = z
    .string()
    .refine((value) => value.trim().length > 0);
const databricksCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.DATABRICKS),
        authenticationType: z.literal(DatabricksAuthenticationType.OAUTH_M2M),
        oauthClientId: nonEmptyIdentifier,
        oauthClientSecret: nonEmptyIdentifier,
    })
    .strict();
const snowflakeCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.SNOWFLAKE),
        authenticationType: z.literal(SnowflakeAuthenticationType.PRIVATE_KEY),
        user: nonEmptyIdentifier,
        privateKey: z.string().min(1),
        privateKeyPass: z.string().optional(),
        role: nonEmptyIdentifier,
        warehouse: nonEmptyIdentifier,
    })
    .strict();
const s3UriSchema = z
    .string()
    .regex(/^s3:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9](?:\/[^?#\s]*)?$/);
const athenaCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.ATHENA),
        authenticationType: z.literal(AthenaAuthenticationType.ACCESS_KEY),
        accessKeyId: nonEmptyIdentifier,
        secretAccessKey: nonEmptyIdentifier,
        sessionToken: nonEmptyIdentifier.optional(),
        workGroup: nonEmptyIdentifier,
        s3StagingDir: s3UriSchema,
        s3DataDir: s3UriSchema.optional(),
    })
    .strict();
const credentialsSchema = z.discriminatedUnion('type', [
    athenaCredentialsSchema,
    bigqueryCredentialsSchema,
    databricksCredentialsSchema,
    snowflakeCredentialsSchema,
]);
const verificationBaseSchema = z
    .object({
        ok: z.literal(true),
        principal: nonEmptyIdentifier,
        observed: z
            .object({
                currentUser: nonEmptyIdentifier,
            })
            .strict(),
        message: z.string(),
        checkedAt: z.coerce.date(),
    })
    .strict();
const databricksVerificationSchema = verificationBaseSchema.refine(
    (value) => value.principal === value.observed.currentUser,
);
const snowflakeVerificationSchema = verificationBaseSchema
    .extend({
        observed: z
            .object({
                currentUser: nonEmptyIdentifier,
                currentRole: nonEmptyIdentifier,
            })
            .strict(),
    })
    .strict()
    .refine((value) => value.principal === value.observed.currentUser);
const athenaVerificationSchema = verificationBaseSchema
    .extend({
        observed: z.object({ principalArn: nonEmptyIdentifier }).strict(),
    })
    .strict()
    .refine((value) => value.principal === value.observed.principalArn);
const athenaPayloadSchema = athenaCredentialsSchema
    .extend({
        verification: athenaVerificationSchema.optional(),
    })
    .strict();

export type AthenaAiServiceAccountSecrets = z.infer<
    typeof athenaCredentialsSchema
>;

const databricksPayloadSchema = databricksCredentialsSchema
    .extend({ verification: databricksVerificationSchema.optional() })
    .strict();

const snowflakePayloadSchema = snowflakeCredentialsSchema
    .extend({ verification: snowflakeVerificationSchema.optional() })
    .strict();

export type SnowflakeAiServiceAccountSecrets = z.infer<
    typeof snowflakeCredentialsSchema
>;

const parseVerification = (
    warehouseType:
        | WarehouseTypes.SNOWFLAKE
        | WarehouseTypes.DATABRICKS
        | WarehouseTypes.ATHENA,
    verification: AiServiceAccountTestResult,
) => {
    switch (warehouseType) {
        case WarehouseTypes.SNOWFLAKE:
            return snowflakeVerificationSchema.parse(verification);
        case WarehouseTypes.DATABRICKS:
            return databricksVerificationSchema.parse(verification);
        case WarehouseTypes.ATHENA:
            return athenaVerificationSchema.parse(verification);
        default:
            return assertUnreachable(
                warehouseType,
                'Unknown verification warehouse',
            );
    }
};

export type BigqueryAiServiceAccountSecrets = z.infer<
    typeof bigqueryCredentialsSchema
>;
export type DatabricksAiServiceAccountSecrets = z.infer<
    typeof databricksCredentialsSchema
>;
export type AiServiceAccountSecrets = z.infer<typeof credentialsSchema>;

export const parseAiServiceAccountSecrets = (
    value: unknown,
): AiServiceAccountSecrets => {
    const result = credentialsSchema.safeParse(value);
    if (!result.success) {
        throw new ParameterError(
            'Provide complete AI service account credentials for the selected method.',
        );
    }
    const credentials = result.data;
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            try {
                const key = createPrivateKey({
                    key: credentials.privateKey,
                    format: 'pem',
                    passphrase: credentials.privateKeyPass,
                });
                if (key.asymmetricKeyType !== 'rsa') throw new Error();
                key.export({ format: 'pem', type: 'pkcs8' });
            } catch {
                throw new ParameterError(
                    'Provide a valid RSA private key and its passphrase, if encrypted.',
                );
            }
            return credentials;
        case WarehouseTypes.DATABRICKS:
        case WarehouseTypes.ATHENA:
            return credentials;
        case WarehouseTypes.BIGQUERY:
            try {
                assertValidBigqueryKeyfile(credentials.keyfileContents, {
                    requireType: 'service_account',
                });
                if (credentials.keyfileContents.type !== 'service_account')
                    throw new Error();
            } catch {
                throw new ParameterError(
                    'Provide a valid BigQuery service account key file.',
                );
            }
            return credentials;
        default:
            return assertUnreachable(
                credentials,
                'Unknown AI service account warehouse',
            );
    }
};

const metadataColumns = [
    'ai_service_account_credential_uuid',
    'identity_uuid',
    'project_uuid',
    'warehouse_connection_uuid',
    'kind',
    'scope',
    'warehouse_type',
    'authentication_method',
    'created_by_user_uuid',
    'updated_by_user_uuid',
    'credential_subject_user_uuid',
    'created_at',
    'updated_at',
] as const;

type MetadataRow = Omit<DbAiServiceAccountCredentials, 'encrypted_credentials'>;

const toSlot = (row: MetadataRow): AiServiceAccountSlot => ({
    uuid: row.ai_service_account_credential_uuid,
    identityUuid: row.identity_uuid,
    projectUuid: row.project_uuid,
    warehouseConnectionUuid: row.warehouse_connection_uuid,
    kind: row.kind,
    scope: row.scope,
    warehouseType: row.warehouse_type,
    method: row.authentication_method,
    createdByUserUuid: row.created_by_user_uuid,
    updatedByUserUuid: row.updated_by_user_uuid,
    credentialSubjectUserUuid: row.credential_subject_user_uuid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export class AiServiceAccountCredentialsModel {
    constructor(
        private readonly args: {
            database: Knex;
            encryptionUtil: EncryptionUtil;
        },
    ) {}

    private query(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        database = this.args.database,
    ) {
        return database(AiServiceAccountCredentialsTableName).where({
            project_uuid: projectUuid,
            warehouse_connection_uuid: warehouseConnectionUuid,
        });
    }

    private decryptPayload(row: DbAiServiceAccountCredentials): {
        secrets: AiServiceAccountSecrets;
        verification: AiServiceAccountTestResult | null;
    } {
        try {
            const value: unknown = JSON.parse(
                this.args.encryptionUtil.decrypt(row.encrypted_credentials),
            );
            const payload = (() => {
                switch (row.warehouse_type) {
                    case WarehouseTypes.DATABRICKS:
                        return databricksPayloadSchema.parse(value);
                    case WarehouseTypes.SNOWFLAKE:
                        return snowflakePayloadSchema.parse(value);
                    case WarehouseTypes.ATHENA:
                        return athenaPayloadSchema.parse(value);
                    case WarehouseTypes.BIGQUERY:
                    case WarehouseTypes.CLICKHOUSE:
                    case WarehouseTypes.DUCKDB:
                    case WarehouseTypes.POSTGRES:
                    case WarehouseTypes.REDSHIFT:
                    case WarehouseTypes.TRINO:
                        return null;
                    default:
                        return assertUnreachable(
                            row.warehouse_type,
                            'Unknown warehouse type',
                        );
                }
            })();
            const { verification, ...credentials } = payload ?? {
                verification: undefined,
            };
            const secrets = parseAiServiceAccountSecrets(
                payload === null ? value : credentials,
            );
            if (
                secrets.type !== row.warehouse_type ||
                secrets.authenticationType !== row.authentication_method
            ) {
                throw new ParameterError('Credential metadata does not match.');
            }
            return { secrets, verification: verification ?? null };
        } catch {
            throw new ParameterError(
                'The saved AI service account credentials could not be read. Replace the credentials.',
            );
        }
    }

    private decrypt(
        row: DbAiServiceAccountCredentials,
    ): AiServiceAccountSecrets {
        return this.decryptPayload(row).secrets;
    }

    async getCredentialsReadable(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        expectedIdentityUuid: string | null,
    ): Promise<boolean> {
        if (expectedIdentityUuid === null) return false;
        const row = await this.query(projectUuid, warehouseConnectionUuid)
            .where('identity_uuid', expectedIdentityUuid)
            .first();
        if (!row) return false;
        try {
            this.decrypt(row);
            return true;
        } catch {
            return false;
        }
    }

    async getVerification(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        expectedIdentityUuid: string | null,
    ): Promise<AiServiceAccountTestResult | null> {
        if (expectedIdentityUuid === null) return null;
        const row = await this.query(projectUuid, warehouseConnectionUuid)
            .where('identity_uuid', expectedIdentityUuid)
            .first();
        if (!row) return null;
        try {
            return this.decryptPayload(row).verification;
        } catch {
            return null;
        }
    }

    async updateVerification(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        expectedIdentityUuid: string,
        verification: AiServiceAccountTestResult,
    ): Promise<void> {
        z.union([
            athenaVerificationSchema,
            databricksVerificationSchema,
            snowflakeVerificationSchema,
        ]).parse(verification);
        await this.args.database.transaction(async (trx) => {
            const row = await this.query(
                projectUuid,
                warehouseConnectionUuid,
                trx,
            )
                .where('identity_uuid', expectedIdentityUuid)
                .forUpdate()
                .first();
            if (!row) return;
            const secrets = this.decrypt(row);
            if (secrets.type === WarehouseTypes.BIGQUERY) return;
            const observation = parseVerification(secrets.type, verification);
            await this.query(projectUuid, warehouseConnectionUuid, trx)
                .where('identity_uuid', expectedIdentityUuid)
                .update({
                    encrypted_credentials: this.args.encryptionUtil.encrypt(
                        JSON.stringify({
                            ...secrets,
                            verification: observation,
                        }),
                    ),
                });
        });
    }

    private tryDecrypt(
        row: DbAiServiceAccountCredentials,
    ): AiServiceAccountSecrets | null {
        try {
            return this.decrypt(row);
        } catch {
            return null;
        }
    }

    async findProjectsMissingSlot(
        organizationUuid: string,
        warehouseType: WarehouseTypes,
    ): Promise<{ projectUuid: string; name: string }[]> {
        return this.args
            .database('projects')
            .join(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .join(
                'warehouse_credentials',
                'warehouse_credentials.project_id',
                'projects.project_id',
            )
            .where('organizations.organization_uuid', organizationUuid)
            .where('projects.project_type', 'DEFAULT')
            .where('warehouse_credentials.warehouse_type', warehouseType)
            .whereNotExists(
                this.args
                    .database(AiServiceAccountCredentialsTableName)
                    .select(this.args.database.raw('1'))
                    .where(
                        'ai_service_account_credentials.project_uuid',
                        this.args.database.ref('projects.project_uuid'),
                    )
                    .where(
                        'ai_service_account_credentials.warehouse_type',
                        warehouseType,
                    )
                    .whereNull('warehouse_connection_uuid'),
            )
            .select({
                projectUuid: 'projects.project_uuid',
                name: 'projects.name',
            })
            .orderBy('projects.name');
    }

    async getSlot(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiServiceAccountSlot | null> {
        const row = await this.query(projectUuid, warehouseConnectionUuid)
            .select(...metadataColumns)
            .first();
        return row ? toSlot(row) : null;
    }

    async getSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        includeSlot: true,
    ): Promise<{
        slot: AiServiceAccountSlot;
        secrets: AiServiceAccountSecrets;
    } | null>;
    async getSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiServiceAccountSecrets | null>;
    async getSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        includeSlot = false,
    ): Promise<
        | AiServiceAccountSecrets
        | { slot: AiServiceAccountSlot; secrets: AiServiceAccountSecrets }
        | null
    > {
        const row = await this.query(
            projectUuid,
            warehouseConnectionUuid,
        ).first();
        if (!row) return null;
        const secrets = this.decrypt(row);
        return includeSlot ? { slot: toSlot(row), secrets } : secrets;
    }

    async getReplaceableSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiServiceAccountSecrets | null> {
        const row = await this.query(
            projectUuid,
            warehouseConnectionUuid,
        ).first();
        return row ? this.tryDecrypt(row) : null;
    }

    async upsert(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        credentials: AiServiceAccountSecrets,
        userUuid: string,
        verification: AiServiceAccountTestResult | null = null,
    ): Promise<AiServiceAccountSlot> {
        const secrets = parseAiServiceAccountSecrets(credentials);
        const payload =
            secrets.type !== WarehouseTypes.BIGQUERY && verification !== null
                ? {
                      ...secrets,
                      verification: parseVerification(
                          secrets.type,
                          verification,
                      ),
                  }
                : secrets;
        return this.args.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .select('project_uuid')
                .forUpdate()
                .first();
            const existing = await this.query(
                projectUuid,
                warehouseConnectionUuid,
                trx,
            )
                .forUpdate()
                .first();
            const identityUuid =
                existing && isEqual(this.tryDecrypt(existing), secrets)
                    ? existing.identity_uuid
                    : randomUUID();
            const values = {
                identity_uuid: identityUuid,
                warehouse_type: secrets.type,
                authentication_method: secrets.authenticationType,
                encrypted_credentials: this.args.encryptionUtil.encrypt(
                    JSON.stringify(payload),
                ),
                updated_by_user_uuid: userUuid,
                updated_at: new Date(),
            };
            const [row] = await trx(AiServiceAccountCredentialsTableName)
                .insert({
                    ...values,
                    project_uuid: projectUuid,
                    warehouse_connection_uuid: warehouseConnectionUuid,
                    created_by_user_uuid: userUuid,
                    credential_subject_user_uuid: null,
                })
                .onConflict(
                    trx.raw(
                        warehouseConnectionUuid === null
                            ? '(project_uuid) WHERE warehouse_connection_uuid IS NULL'
                            : '(project_uuid, warehouse_connection_uuid) WHERE warehouse_connection_uuid IS NOT NULL',
                    ),
                )
                .merge(values)
                .returning('*');
            return toSlot(row);
        });
    }

    async delete(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<void> {
        await this.query(projectUuid, warehouseConnectionUuid).delete();
    }
}
