import {
    AiIdentity,
    AiIdentityMemberWithoutIdentity,
    AiIdentitySettings,
    AiIdentityStatus,
    resolveAiTwinName,
} from '@lightdash/common';
import { Knex } from 'knex';
import { createHash } from 'node:crypto';
import {
    AiIdentitiesTableName,
    DbAiIdentity,
} from '../database/entities/aiIdentities';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { usersInProjectSql } from './AnalyticsModelSql';

type IdentityRow = DbAiIdentity & {
    email: string;
    first_name: string;
    last_name: string;
    ai_twin_name_template: string | null;
};

export class AiIdentityModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor({
        database,
        encryptionUtil,
    }: {
        database: Knex;
        encryptionUtil: EncryptionUtil;
    }) {
        this.database = database;
        this.encryptionUtil = encryptionUtil;
    }

    async getSettings(projectUuid: string): Promise<AiIdentitySettings> {
        const project = await this.database('projects')
            .where('project_uuid', projectUuid)
            .select('ai_twin_name_template')
            .first<{ ai_twin_name_template: string | null }>();
        if (!project) throw new Error('Project not found');
        return { twinNameTemplate: project.ai_twin_name_template };
    }

    async updateSettings(
        projectUuid: string,
        settings: AiIdentitySettings,
    ): Promise<AiIdentitySettings> {
        await this.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .update({ ai_twin_name_template: settings.twinNameTemplate });
            await trx(AiIdentitiesTableName)
                .where('project_uuid', projectUuid)
                .update({
                    status: AiIdentityStatus.PENDING,
                    status_message: null,
                    checked_at: null,
                    updated_at: new Date(),
                });
        });
        return settings;
    }

    private queryRows() {
        return this.database(AiIdentitiesTableName)
            .join('users', 'users.user_uuid', 'ai_identities.user_uuid')
            .join(
                'projects',
                'projects.project_uuid',
                'ai_identities.project_uuid',
            )
            .join('emails', 'emails.user_id', 'users.user_id')
            .where('emails.is_primary', true)
            .select(
                'ai_identities.*',
                'users.first_name',
                'users.last_name',
                'emails.email',
                'projects.ai_twin_name_template',
            );
    }

    private toIdentity(row: IdentityRow): AiIdentity {
        return {
            aiIdentityUuid: row.ai_identity_uuid,
            userUuid: row.user_uuid,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            snowflakeLogin: row.snowflake_login,
            twinNameOverride: row.twin_name_override,
            twinName: resolveAiTwinName({
                twinNameOverride: row.twin_name_override,
                twinNameTemplate: row.ai_twin_name_template,
                snowflakeLogin: row.snowflake_login,
            }),
            publicKey: row.public_key,
            publicKeyFingerprint: row.public_key_fingerprint,
            status: row.status,
            statusMessage: row.status_message,
            checkedAt: row.checked_at,
        };
    }

    async list(projectUuid: string): Promise<AiIdentity[]> {
        const rows = (await this.queryRows().where(
            'ai_identities.project_uuid',
            projectUuid,
        )) as IdentityRow[];
        return rows.map((row) => this.toIdentity(row));
    }

    async getProjectMembers({
        projectUuid,
        organizationUuid,
    }: {
        projectUuid: string;
        organizationUuid: string;
    }): Promise<AiIdentityMemberWithoutIdentity[]> {
        const result: { rows: { user_uuid: string }[] } =
            await this.database.raw(usersInProjectSql(), {
                projectUuid,
                organizationUuid,
            });
        const userUuids = result.rows.map((row) => row.user_uuid);
        if (userUuids.length === 0) return [];
        const rows: {
            user_uuid: string;
            email: string;
            first_name: string;
            last_name: string;
        }[] = await this.database('users')
            .join('emails', 'emails.user_id', 'users.user_id')
            .where('emails.is_primary', true)
            .where('users.is_active', true)
            .whereIn('users.user_uuid', userUuids)
            .select(
                'users.user_uuid',
                'emails.email',
                'users.first_name',
                'users.last_name',
            );
        return rows.map((row) => ({
            userUuid: row.user_uuid,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
        }));
    }

    async find({
        projectUuid,
        userUuid,
    }: {
        projectUuid: string;
        userUuid: string;
    }): Promise<AiIdentity | null> {
        const row = await this.queryRows()
            .where('ai_identities.project_uuid', projectUuid)
            .andWhere('ai_identities.user_uuid', userUuid)
            .first<IdentityRow>();
        return row ? this.toIdentity(row) : null;
    }

    async findWithPrivateKey({
        projectUuid,
        userUuid,
    }: {
        projectUuid: string;
        userUuid: string;
    }): Promise<(AiIdentity & { privateKey: string }) | null> {
        const row = await this.queryRows()
            .where('ai_identities.project_uuid', projectUuid)
            .andWhere('ai_identities.user_uuid', userUuid)
            .first<IdentityRow>();
        return row
            ? {
                  ...this.toIdentity(row),
                  privateKey: this.encryptionUtil.decrypt(
                      row.encrypted_private_key,
                  ),
              }
            : null;
    }

    async create({
        projectUuid,
        userUuid,
        snowflakeLogin,
        publicKey,
        privateKey,
    }: {
        projectUuid: string;
        userUuid: string;
        snowflakeLogin: string | null;
        publicKey: string;
        privateKey: string;
    }): Promise<AiIdentity> {
        await this.database(AiIdentitiesTableName)
            .insert({
                project_uuid: projectUuid,
                user_uuid: userUuid,
                snowflake_login: snowflakeLogin,
                public_key: publicKey,
                public_key_fingerprint: `SHA256:${createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('base64')}`,
                encrypted_private_key: this.encryptionUtil.encrypt(privateKey),
            })
            .onConflict(['project_uuid', 'user_uuid'])
            .ignore();
        const identity = await this.find({ projectUuid, userUuid });
        if (!identity) throw new Error('AI identity was not created');
        return identity;
    }

    async setSnowflakeLogin(
        aiIdentityUuid: string,
        snowflakeLogin: string,
    ): Promise<void> {
        await this.database(AiIdentitiesTableName)
            .where('ai_identity_uuid', aiIdentityUuid)
            .update({
                snowflake_login: snowflakeLogin,
                status: AiIdentityStatus.PENDING,
                status_message: null,
                updated_at: new Date(),
            });
    }

    private async getByUuid(aiIdentityUuid: string): Promise<AiIdentity> {
        const row = await this.queryRows()
            .where('ai_identities.ai_identity_uuid', aiIdentityUuid)
            .first<IdentityRow>();
        if (!row) throw new Error('AI identity not found');
        return this.toIdentity(row);
    }

    async setTwinNameOverride(
        aiIdentityUuid: string,
        twinNameOverride: string | null,
    ): Promise<AiIdentity> {
        await this.database(AiIdentitiesTableName)
            .where('ai_identity_uuid', aiIdentityUuid)
            .update({
                twin_name_override: twinNameOverride,
                status: AiIdentityStatus.PENDING,
                status_message: null,
                checked_at: null,
                updated_at: new Date(),
            });
        return this.getByUuid(aiIdentityUuid);
    }

    async updateStatus(
        aiIdentityUuid: string,
        {
            status,
            statusMessage,
        }: { status: AiIdentityStatus; statusMessage: string | null },
    ): Promise<AiIdentity> {
        await this.database(AiIdentitiesTableName)
            .where('ai_identity_uuid', aiIdentityUuid)
            .update({
                status,
                status_message: statusMessage,
                checked_at: new Date(),
                updated_at: new Date(),
            });
        return this.getByUuid(aiIdentityUuid);
    }

    async regenerateKey(
        aiIdentityUuid: string,
        { publicKey, privateKey }: { publicKey: string; privateKey: string },
    ): Promise<AiIdentity> {
        await this.database(AiIdentitiesTableName)
            .where('ai_identity_uuid', aiIdentityUuid)
            .update({
                public_key: publicKey,
                public_key_fingerprint: `SHA256:${createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('base64')}`,
                encrypted_private_key: this.encryptionUtil.encrypt(privateKey),
                status: AiIdentityStatus.PENDING,
                status_message: null,
                checked_at: null,
                updated_at: new Date(),
            });
        return this.getByUuid(aiIdentityUuid);
    }

    async deleteForUser(
        userUuid: string,
        database: Knex = this.database,
    ): Promise<number> {
        return database(AiIdentitiesTableName)
            .where('user_uuid', userUuid)
            .delete();
    }
}
