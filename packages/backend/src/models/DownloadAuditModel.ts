import {
    DownloadActivityResults,
    DownloadAuditEntry,
    KnexPaginateArgs,
    ParameterError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DownloadAuditTableName } from '../database/entities/downloadAudit';
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';

type DownloadCursor = { at: string; uuid: string };

const encodeCursor = (row: { downloaded_at: Date; download_uuid: string }) =>
    Buffer.from(
        JSON.stringify({
            at: row.downloaded_at.toISOString(),
            uuid: row.download_uuid,
        }),
    ).toString('base64');

const decodeCursor = (raw: string): DownloadCursor => {
    try {
        const parsed = JSON.parse(
            Buffer.from(raw, 'base64').toString('utf8'),
        ) as DownloadCursor;
        if (
            typeof parsed?.at !== 'string' ||
            typeof parsed?.uuid !== 'string'
        ) {
            throw new Error('cursor fields missing');
        }
        if (Number.isNaN(new Date(parsed.at).getTime())) {
            throw new Error('invalid date in cursor');
        }
        return parsed;
    } catch (e) {
        throw new ParameterError(`Invalid cursor: ${(e as Error).message}`);
    }
};

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
        cursor?: string,
    ): Promise<DownloadActivityResults> {
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
            .orderBy([
                {
                    column: `${DownloadAuditTableName}.downloaded_at`,
                    order: 'desc',
                },
                {
                    column: `${DownloadAuditTableName}.download_uuid`,
                    order: 'desc',
                },
            ]);

        const buildResult = (
            rows: Awaited<typeof baseQuery>,
            page: number | null,
            totalPageCount: number | null,
            totalResults: number | null,
        ): DownloadActivityResults => {
            const lastRow = rows[rows.length - 1];
            const hasNext =
                rows.length === paginateArgs.pageSize &&
                (totalResults === null ||
                    page === null ||
                    page * paginateArgs.pageSize < totalResults);
            return {
                data: rows.map((row) => ({
                    downloadUuid: row.download_uuid,
                    queryUuid: row.query_uuid,
                    userUuid: row.user_uuid,
                    userFirstName: row.first_name,
                    userLastName: row.last_name,
                    fileType: row.file_type,
                    downloadedAt: row.downloaded_at,
                    originalQueryContext: row.original_query_context,
                })),
                pagination: {
                    pageSize: paginateArgs.pageSize,
                    page,
                    totalPageCount,
                    totalResults,
                    nextCursor:
                        hasNext && lastRow ? encodeCursor(lastRow) : null,
                },
            };
        };

        if (cursor !== undefined) {
            // Cursor mode: O(LIMIT) regardless of depth. Skips the count CTE
            // entirely — totalResults/page/totalPageCount are returned as null.
            // Pass `at` as a Date (not the raw ISO string) so node-postgres
            // formats it with the local TZ offset; the `timestamp without time zone`
            // column then strips the offset and round-trips correctly.
            const { at, uuid } = decodeCursor(cursor);
            const rows = await baseQuery
                .whereRaw(
                    `(${DownloadAuditTableName}.downloaded_at, ${DownloadAuditTableName}.download_uuid) < (?, ?)`,
                    [new Date(at), uuid],
                )
                .limit(paginateArgs.pageSize);
            return buildResult(rows, null, null, null);
        }

        const { data, pagination } = await KnexPaginate.paginate(
            baseQuery,
            paginateArgs,
        );
        return buildResult(
            data,
            pagination?.page ?? paginateArgs.page,
            pagination?.totalPageCount ?? null,
            pagination?.totalResults ?? null,
        );
    }
}
