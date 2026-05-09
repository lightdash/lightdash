import {
    DownloadAuditEntry,
    KnexPaginateArgs,
    KnexPaginatedData,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DownloadAuditTableName } from '../database/entities/downloadAudit';
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';

type DownloadAuditModelArguments = {
    database: Knex;
};

type LogDownloadParams = {
    queryUuid: string;
    userUuid: string | null;
    organizationUuid: string;
    projectUuid: string | null;
    fileType: string;
    originalQueryContext: string | null;
};

export class DownloadAuditModel {
    private database: Knex;

    constructor(args: DownloadAuditModelArguments) {
        this.database = args.database;
    }

    async logDownload({
        queryUuid,
        userUuid,
        organizationUuid,
        projectUuid,
        fileType,
        originalQueryContext,
    }: LogDownloadParams): Promise<void> {
        await this.database(DownloadAuditTableName).insert({
            query_uuid: queryUuid,
            user_uuid: userUuid,
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            file_type: fileType,
            original_query_context: originalQueryContext,
        });
    }

    async getDownloads(
        organizationUuid: string,
        projectUuid: string,
        paginateArgs: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<DownloadAuditEntry[]>> {
        // Note: offset-based pagination is susceptible to drift when new rows
        // are inserted between page fetches — rows near page boundaries may be
        // duplicated or skipped. A future improvement would be cursor-based
        // pagination using (downloaded_at, download_uuid) as the stable cursor.
        const baseQuery = this.database(DownloadAuditTableName)
            .select<
                {
                    download_uuid: string;
                    query_uuid: string;
                    user_uuid: string | null;
                    first_name: string | null;
                    last_name: string | null;
                    file_type: string;
                    downloaded_at: Date;
                    original_query_context: string | null;
                }[]
            >(
                `${DownloadAuditTableName}.download_uuid`,
                `${DownloadAuditTableName}.query_uuid`,
                `${DownloadAuditTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${DownloadAuditTableName}.file_type`,
                `${DownloadAuditTableName}.downloaded_at`,
                `${DownloadAuditTableName}.original_query_context`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DownloadAuditTableName}.user_uuid`,
            )
            .where(
                `${DownloadAuditTableName}.organization_uuid`,
                organizationUuid,
            )
            .andWhere(`${DownloadAuditTableName}.project_uuid`, projectUuid)
            .orderBy(`${DownloadAuditTableName}.downloaded_at`, 'desc');

        const { data, pagination } = await KnexPaginate.paginate(
            baseQuery,
            paginateArgs,
        );

        return {
            data: data.map((row) => ({
                downloadUuid: row.download_uuid,
                queryUuid: row.query_uuid,
                userUuid: row.user_uuid,
                userFirstName: row.first_name,
                userLastName: row.last_name,
                fileType: row.file_type,
                downloadedAt: row.downloaded_at,
                originalQueryContext: row.original_query_context,
            })),
            pagination,
        };
    }
}
