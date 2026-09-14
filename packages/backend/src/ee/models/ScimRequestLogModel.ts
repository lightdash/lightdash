import {
    KnexPaginateArgs,
    KnexPaginatedData,
    ScimRequestAction,
    ScimRequestLog,
} from '@lightdash/common';
import { Knex } from 'knex';
import KnexPaginate from '../../database/pagination';
import {
    DbScimRequestLog,
    ScimRequestLogsTableName,
} from '../database/entities/scimRequestLogs';
import { ServiceAccountsTableName } from '../database/entities/serviceAccounts';
import { type ExtractedScimRequestLog } from '../scim/extractScimRequestLog';

type DbScimRequestLogWithToken = DbScimRequestLog & {
    token_description: string | null;
};

export type CreateScimRequestLog = ExtractedScimRequestLog & {
    organizationUuid: string;
    serviceAccountUuid: string | null;
};

export class ScimRequestLogModel {
    private database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(log: CreateScimRequestLog): Promise<void> {
        await this.database(ScimRequestLogsTableName).insert({
            organization_uuid: log.organizationUuid,
            service_account_uuid: log.serviceAccountUuid,
            method: log.method,
            url: log.url,
            action: log.action,
            target_identity: log.targetIdentity,
            target_uuid: log.targetUuid,
            affected_roles: JSON.stringify(log.affectedRoles),
            status: log.status,
            error_detail: log.errorDetail,
            scim_type: log.scimType,
        });
    }

    async getPaginated({
        organizationUuid,
        paginateArgs,
    }: {
        organizationUuid: string;
        paginateArgs: KnexPaginateArgs;
    }): Promise<KnexPaginatedData<ScimRequestLog[]>> {
        const query = this.database(ScimRequestLogsTableName)
            .leftJoin(
                ServiceAccountsTableName,
                `${ScimRequestLogsTableName}.service_account_uuid`,
                `${ServiceAccountsTableName}.service_account_uuid`,
            )
            .where(
                `${ScimRequestLogsTableName}.organization_uuid`,
                organizationUuid,
            )
            .select<DbScimRequestLogWithToken[]>(
                `${ScimRequestLogsTableName}.*`,
                `${ServiceAccountsTableName}.description as token_description`,
            )
            .orderBy(`${ScimRequestLogsTableName}.created_at`, 'desc')
            .orderBy(
                `${ScimRequestLogsTableName}.scim_request_log_uuid`,
                'desc',
            );

        const { data, pagination } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        return {
            data: data.map(ScimRequestLogModel.mapRow),
            pagination,
        };
    }

    async cleanupBatch(
        cutoffDate: Date,
        {
            batchSize,
            delayMs,
            maxBatches,
        }: { batchSize: number; delayMs: number; maxBatches: number },
    ): Promise<{ totalDeleted: number; batchCount: number }> {
        let totalDeleted = 0;
        let batchCount = 0;

        while (batchCount < maxBatches) {
            const idsToDelete = this.database(ScimRequestLogsTableName)
                .select('scim_request_log_uuid')
                .where('created_at', '<', cutoffDate)
                .orderBy('created_at', 'asc')
                .limit(batchSize);

            // eslint-disable-next-line no-await-in-loop
            const deletedCount = await this.database(ScimRequestLogsTableName)
                .whereIn('scim_request_log_uuid', idsToDelete)
                .del();

            if (deletedCount === 0) break;
            totalDeleted += deletedCount;
            batchCount += 1;

            if (deletedCount < batchSize) break;

            // eslint-disable-next-line no-await-in-loop
            await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), delayMs);
            });
        }

        return { totalDeleted, batchCount };
    }

    private static mapRow(row: DbScimRequestLogWithToken): ScimRequestLog {
        return {
            uuid: row.scim_request_log_uuid,
            organizationUuid: row.organization_uuid,
            serviceAccountUuid: row.service_account_uuid,
            tokenDescription: row.token_description,
            method: row.method,
            url: row.url,
            action: row.action as ScimRequestAction,
            targetIdentity: row.target_identity,
            targetUuid: row.target_uuid,
            affectedRoles: row.affected_roles,
            status: row.status,
            errorDetail: row.error_detail,
            scimType: row.scim_type,
            createdAt: row.created_at,
        };
    }
}
