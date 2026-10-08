import {
    assertValidBigqueryKeyfile,
    BigqueryAuthenticationType,
    ParameterError,
    WarehouseTypes,
    type AiServiceAccountSlot,
} from '@lightdash/common';
import { type Knex } from 'knex';
import isEqual from 'lodash/isEqual';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
    AiServiceAccountCredentialsTableName,
    type DbAiServiceAccountCredentials,
} from '../../database/entities/aiServiceAccountCredentials';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

const credentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.BIGQUERY),
        authenticationType: z.literal(BigqueryAuthenticationType.PRIVATE_KEY),
        keyfileContents: z.record(z.string(), z.string()),
    })
    .strict();

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
    try {
        assertValidBigqueryKeyfile(result.data.keyfileContents, {
            requireType: 'service_account',
        });
        if (result.data.keyfileContents.type !== 'service_account') {
            throw new ParameterError('Service account type is required.');
        }
    } catch {
        throw new ParameterError(
            'Provide a valid BigQuery service account key file.',
        );
    }
    return result.data;
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

    private decrypt(
        row: DbAiServiceAccountCredentials,
    ): AiServiceAccountSecrets {
        try {
            const value: unknown = JSON.parse(
                this.args.encryptionUtil.decrypt(row.encrypted_credentials),
            );
            const secrets = parseAiServiceAccountSecrets(value);
            if (
                secrets.type !== row.warehouse_type ||
                secrets.authenticationType !== row.authentication_method
            ) {
                throw new ParameterError('Credential metadata does not match.');
            }
            return secrets;
        } catch {
            throw new ParameterError(
                'The saved AI service account credentials could not be read. Replace the credentials.',
            );
        }
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
    ): Promise<AiServiceAccountSlot> {
        const secrets = parseAiServiceAccountSecrets(credentials);
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
                    JSON.stringify(secrets),
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
