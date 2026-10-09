import { ParameterError } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    OrganizationSnowflakeAgentClientsTableName,
    type DbOrganizationSnowflakeAgentClient,
} from '../database/entities/organizationSnowflakeAgentClients';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

const metadataColumns = [
    'organization_uuid',
    'account_url',
    'account_identifier',
    'client_id',
    'client_version',
    'updated_at',
] as const;
type MetadataRow = Pick<
    DbOrganizationSnowflakeAgentClient,
    (typeof metadataColumns)[number]
>;
const toMetadata = (row: MetadataRow) => ({
    organizationUuid: row.organization_uuid,
    accountUrl: row.account_url,
    accountIdentifier: row.account_identifier,
    clientId: row.client_id,
    clientVersion: row.client_version,
    updatedAt: row.updated_at,
});

export class OrganizationSnowflakeAgentClientModel {
    constructor(
        private readonly args: {
            database: Knex;
            encryptionUtil: EncryptionUtil;
        },
    ) {}

    private decrypt(row: DbOrganizationSnowflakeAgentClient): string {
        try {
            return this.args.encryptionUtil.decrypt(
                row.encrypted_client_secret,
            );
        } catch {
            throw new ParameterError(
                'The saved Snowflake client secret could not be read. Replace the client credentials.',
            );
        }
    }

    async getMetadata(organizationUuid: string) {
        const row = await this.args
            .database(OrganizationSnowflakeAgentClientsTableName)
            .select(...metadataColumns)
            .where('organization_uuid', organizationUuid)
            .first();
        return row ? toMetadata(row) : null;
    }

    async getWithSecret(organizationUuid: string) {
        const row = await this.args
            .database(OrganizationSnowflakeAgentClientsTableName)
            .where('organization_uuid', organizationUuid)
            .first();
        return row
            ? { ...toMetadata(row), clientSecret: this.decrypt(row) }
            : null;
    }

    async upsert({
        organizationUuid,
        accountUrl,
        accountIdentifier,
        clientId,
        clientSecret,
        userUuid,
    }: {
        organizationUuid: string;
        accountUrl: string;
        accountIdentifier: string;
        clientId: string;
        clientSecret: string;
        userUuid: string;
    }) {
        return this.args.database.transaction(async (trx) => {
            const values = {
                account_url: accountUrl,
                account_identifier: accountIdentifier,
                client_id: clientId,
                encrypted_client_secret:
                    this.args.encryptionUtil.encrypt(clientSecret),
                client_version: randomUUID(),
                updated_at: new Date(),
                updated_by_user_uuid: userUuid,
            };
            const [inserted] = await trx(
                OrganizationSnowflakeAgentClientsTableName,
            )
                .insert({
                    ...values,
                    organization_uuid: organizationUuid,
                    created_by_user_uuid: userUuid,
                })
                .onConflict('organization_uuid')
                .ignore()
                .returning('*');
            if (inserted)
                return { ...toMetadata(inserted), action: 'created' as const };
            const existing = await trx(
                OrganizationSnowflakeAgentClientsTableName,
            )
                .where('organization_uuid', organizationUuid)
                .forUpdate()
                .first();
            let sameSecret = false;
            if (existing) {
                try {
                    sameSecret = this.decrypt(existing) === clientSecret;
                } catch {
                    sameSecret = false;
                }
            }
            const clientVersion =
                existing &&
                existing.account_url === accountUrl &&
                existing.client_id === clientId &&
                sameSecret
                    ? existing.client_version
                    : values.client_version;
            const [row] = await trx(OrganizationSnowflakeAgentClientsTableName)
                .where('organization_uuid', organizationUuid)
                .update({ ...values, client_version: clientVersion })
                .returning('*');
            const action =
                clientVersion === existing?.client_version
                    ? ('unchanged' as const)
                    : ('replaced' as const);
            return { ...toMetadata(row), action };
        });
    }
}
