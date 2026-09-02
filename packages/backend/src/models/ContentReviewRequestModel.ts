import {
    ContentReviewContentType,
    ContentReviewRequestStatus,
    NotFoundError,
    type ContentReviewGrantedPrincipal,
    type ContentReviewMovedItem,
    type ContentReviewRequest,
    type ContentReviewSimilarContentItem,
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ContentReviewRequestsTableName,
    type DbContentReviewRequest,
} from '../database/entities/contentReviewRequests';
import { DashboardsTableName } from '../database/entities/dashboards';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import { compactContentSearchText } from './ContentModel/ContentSearchUtils';

type ContentReviewRequestModelArguments = {
    database: Knex;
};

type DbContentReviewRequestWithUsers = DbContentReviewRequest & {
    requester_first_name: string;
    requester_last_name: string;
    reviewer_first_name: string | null;
    reviewer_last_name: string | null;
};

const REQUESTER_ALIAS = 'requester';
const REVIEWER_ALIAS = 'reviewer';

const parseRow = (
    row: DbContentReviewRequestWithUsers,
): ContentReviewRequest => ({
    uuid: row.content_review_request_uuid,
    projectUuid: row.project_uuid,
    contentType: row.content_type as ContentReviewContentType,
    contentUuid: row.content_uuid,
    sourceSpaceUuid: row.source_space_uuid,
    targetSpaceUuid: row.target_space_uuid,
    requestedBy: {
        userUuid: row.requested_by_user_uuid,
        firstName: row.requester_first_name,
        lastName: row.requester_last_name,
    },
    requestNote: row.request_note,
    similarContent: row.similar_content as ContentReviewSimilarContentItem[],
    status: row.status as ContentReviewRequestStatus,
    reviewedBy:
        row.reviewed_by_user_uuid === null
            ? null
            : {
                  userUuid: row.reviewed_by_user_uuid,
                  firstName: row.reviewer_first_name ?? '',
                  lastName: row.reviewer_last_name ?? '',
              },
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    verifiedOnApprove: row.verified_on_approve,
    movedContent: row.moved_content as ContentReviewMovedItem[],
    grantedPrincipals:
        row.granted_principals as ContentReviewGrantedPrincipal[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export type CreateContentReviewRequest = {
    projectUuid: string;
    contentType: ContentReviewContentType;
    contentUuid: string;
    sourceSpaceUuid: string;
    targetSpaceUuid: string;
    requestedByUserUuid: string;
    requestNote: string | null;
    similarContent: ContentReviewSimilarContentItem[];
    grantedPrincipals: ContentReviewGrantedPrincipal[];
};

export type ContentReviewContentLocation = {
    uuid: string;
    name: string;
    slug: string;
    spaceUuid: string | null;
    dashboardUuid: string | null;
    deleted: boolean;
};

export type ContentReviewSpaceInfo = {
    uuid: string;
    name: string;
    projectUuid: string;
    isDefaultUserSpace: boolean;
    deleted: boolean;
};

type DbLocationRow = {
    uuid: string;
    name: string;
    slug: string;
    space_uuid: string | null;
    dashboard_uuid: string | null;
    deleted_at: Date | null;
};

const parseLocationRow = (
    row: DbLocationRow,
): ContentReviewContentLocation => ({
    uuid: row.uuid,
    name: row.name,
    slug: row.slug,
    spaceUuid: row.space_uuid,
    dashboardUuid: row.dashboard_uuid,
    deleted: row.deleted_at !== null,
});

export type ContentReviewSimilarCandidate = {
    contentType: ContentReviewContentType;
    uuid: string;
    name: string;
    slug: string;
    spaceUuid: string;
    spaceName: string;
    score: number;
};

const EXACT_NAME_SCORE = 100;
const CONTAINED_NAME_SCORE = 50;
const COMPACT_NAME_SQL = "regexp_replace(lower(??), '[^a-z0-9]+', '', 'g')";

type SimilarSource = {
    contentType: ContentReviewContentType;
    table: string;
    uuidColumn: string;
    spaceJoin: { left: string; right: string };
};

const SIMILAR_SOURCES: Record<
    'chart' | 'sqlChart' | 'dashboard',
    SimilarSource
> = {
    chart: {
        contentType: ContentReviewContentType.CHART,
        table: SavedChartsTableName,
        uuidColumn: 'saved_query_uuid',
        spaceJoin: {
            left: `${SavedChartsTableName}.space_id`,
            right: `${SpaceTableName}.space_id`,
        },
    },
    sqlChart: {
        contentType: ContentReviewContentType.SQL_CHART,
        table: SavedSqlTableName,
        uuidColumn: 'saved_sql_uuid',
        spaceJoin: {
            left: `${SavedSqlTableName}.space_uuid`,
            right: `${SpaceTableName}.space_uuid`,
        },
    },
    dashboard: {
        contentType: ContentReviewContentType.DASHBOARD,
        table: DashboardsTableName,
        uuidColumn: 'dashboard_uuid',
        spaceJoin: {
            left: `${DashboardsTableName}.space_id`,
            right: `${SpaceTableName}.space_id`,
        },
    },
};

export type ListContentReviewRequestsFilters = {
    projectUuid: string;
    status: ContentReviewRequestStatus | null;
    requestedByUserUuid: string | null;
    targetSpaceUuids: string[] | null;
};

// Called from chart and dashboard delete paths so a deleted item never
// leaves a request pending
export const cancelPendingContentReviewRequests = async (
    database: Knex,
    contentType: ContentReviewContentType,
    contentUuids: string[],
): Promise<number> => {
    if (contentUuids.length === 0) return 0;
    return database(ContentReviewRequestsTableName)
        .where({
            content_type: contentType,
            status: ContentReviewRequestStatus.PENDING,
        })
        .whereIn('content_uuid', contentUuids)
        .update({
            status: ContentReviewRequestStatus.CANCELLED,
            updated_at: new Date(),
        });
};

export class ContentReviewRequestModel {
    private readonly database: Knex;

    constructor({ database }: ContentReviewRequestModelArguments) {
        this.database = database;
    }

    private baseQuery(db: Knex = this.database) {
        return db(ContentReviewRequestsTableName)
            .innerJoin(
                { [REQUESTER_ALIAS]: UserTableName },
                `${REQUESTER_ALIAS}.user_uuid`,
                `${ContentReviewRequestsTableName}.requested_by_user_uuid`,
            )
            .leftJoin(
                { [REVIEWER_ALIAS]: UserTableName },
                `${REVIEWER_ALIAS}.user_uuid`,
                `${ContentReviewRequestsTableName}.reviewed_by_user_uuid`,
            )
            .select<DbContentReviewRequestWithUsers[]>(
                `${ContentReviewRequestsTableName}.*`,
                `${REQUESTER_ALIAS}.first_name as requester_first_name`,
                `${REQUESTER_ALIAS}.last_name as requester_last_name`,
                `${REVIEWER_ALIAS}.first_name as reviewer_first_name`,
                `${REVIEWER_ALIAS}.last_name as reviewer_last_name`,
            );
    }

    async create(
        request: CreateContentReviewRequest,
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<ContentReviewRequest> {
        const [row] = await tx(ContentReviewRequestsTableName)
            .insert({
                project_uuid: request.projectUuid,
                content_type: request.contentType,
                content_uuid: request.contentUuid,
                source_space_uuid: request.sourceSpaceUuid,
                target_space_uuid: request.targetSpaceUuid,
                requested_by_user_uuid: request.requestedByUserUuid,
                request_note: request.requestNote,
                similar_content: JSON.stringify(request.similarContent),
                granted_principals: JSON.stringify(request.grantedPrincipals),
            })
            .returning('content_review_request_uuid');
        return this.getByUuid(row.content_review_request_uuid, { tx });
    }

    async findByUuid(
        uuid: string,
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<ContentReviewRequest | null> {
        const row = await this.baseQuery(tx)
            .where(
                `${ContentReviewRequestsTableName}.content_review_request_uuid`,
                uuid,
            )
            .first();
        return row ? parseRow(row) : null;
    }

    async getByUuid(
        uuid: string,
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<ContentReviewRequest> {
        const request = await this.findByUuid(uuid, { tx });
        if (!request) {
            throw new NotFoundError('Review request not found');
        }
        return request;
    }

    async findPendingByContent(
        contentType: ContentReviewContentType,
        contentUuid: string,
    ): Promise<ContentReviewRequest | null> {
        const row = await this.baseQuery()
            .where(
                `${ContentReviewRequestsTableName}.content_type`,
                contentType,
            )
            .where(
                `${ContentReviewRequestsTableName}.content_uuid`,
                contentUuid,
            )
            .where(
                `${ContentReviewRequestsTableName}.status`,
                ContentReviewRequestStatus.PENDING,
            )
            .first();
        return row ? parseRow(row) : null;
    }

    async findPendingByContentUuids(
        contentType: ContentReviewContentType,
        contentUuids: string[],
    ): Promise<Map<string, ContentReviewRequest>> {
        if (contentUuids.length === 0) return new Map();
        const rows = await this.baseQuery()
            .where(
                `${ContentReviewRequestsTableName}.content_type`,
                contentType,
            )
            .whereIn(
                `${ContentReviewRequestsTableName}.content_uuid`,
                contentUuids,
            )
            .where(
                `${ContentReviewRequestsTableName}.status`,
                ContentReviewRequestStatus.PENDING,
            );
        return new Map(rows.map((row) => [row.content_uuid, parseRow(row)]));
    }

    async list(
        filters: ListContentReviewRequestsFilters,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ContentReviewRequest[]>> {
        const query = this.baseQuery()
            .where(
                `${ContentReviewRequestsTableName}.project_uuid`,
                filters.projectUuid,
            )
            .orderBy(`${ContentReviewRequestsTableName}.created_at`, 'desc');
        if (filters.status !== null) {
            void query.where(
                `${ContentReviewRequestsTableName}.status`,
                filters.status,
            );
        }
        if (filters.requestedByUserUuid !== null) {
            void query.where(
                `${ContentReviewRequestsTableName}.requested_by_user_uuid`,
                filters.requestedByUserUuid,
            );
        }
        if (filters.targetSpaceUuids !== null) {
            void query.whereIn(
                `${ContentReviewRequestsTableName}.target_space_uuid`,
                filters.targetSpaceUuids,
            );
        }
        const result = await KnexPaginate.paginate(query, paginateArgs);
        return { ...result, data: result.data.map(parseRow) };
    }

    private async transitionFromPending(
        uuid: string,
        update: {
            status: ContentReviewRequestStatus;
            reviewed_by_user_uuid: string | null;
            review_note: string | null;
            verified_on_approve: boolean | null;
            moved_content: ContentReviewMovedItem[];
        },
        tx: Knex,
    ): Promise<ContentReviewRequest> {
        const updated = await tx(ContentReviewRequestsTableName)
            .where({
                content_review_request_uuid: uuid,
                status: ContentReviewRequestStatus.PENDING,
            })
            .update({
                status: update.status,
                reviewed_by_user_uuid: update.reviewed_by_user_uuid,
                reviewed_at: new Date(),
                review_note: update.review_note,
                verified_on_approve: update.verified_on_approve,
                moved_content: JSON.stringify(update.moved_content),
                updated_at: new Date(),
            });
        if (updated === 0) {
            throw new NotFoundError('Review request is not pending');
        }
        return this.getByUuid(uuid, { tx });
    }

    async approve(
        uuid: string,
        decision: {
            reviewedByUserUuid: string;
            reviewNote: string | null;
            verifiedOnApprove: boolean;
            movedContent: ContentReviewMovedItem[];
        },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<ContentReviewRequest> {
        return this.transitionFromPending(
            uuid,
            {
                status: ContentReviewRequestStatus.APPROVED,
                reviewed_by_user_uuid: decision.reviewedByUserUuid,
                review_note: decision.reviewNote,
                verified_on_approve: decision.verifiedOnApprove,
                moved_content: decision.movedContent,
            },
            tx,
        );
    }

    async reject(
        uuid: string,
        decision: { reviewedByUserUuid: string; reviewNote: string },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<ContentReviewRequest> {
        return this.transitionFromPending(
            uuid,
            {
                status: ContentReviewRequestStatus.REJECTED,
                reviewed_by_user_uuid: decision.reviewedByUserUuid,
                review_note: decision.reviewNote,
                verified_on_approve: null,
                moved_content: [],
            },
            tx,
        );
    }

    async cancel(
        uuid: string,
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<ContentReviewRequest> {
        return this.transitionFromPending(
            uuid,
            {
                status: ContentReviewRequestStatus.CANCELLED,
                reviewed_by_user_uuid: null,
                review_note: null,
                verified_on_approve: null,
                moved_content: [],
            },
            tx,
        );
    }

    // Grants are revoked on every terminal transition; clearing the list
    // records that nothing is left to revoke
    async clearGrantedPrincipals(
        uuid: string,
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<void> {
        await tx(ContentReviewRequestsTableName)
            .where('content_review_request_uuid', uuid)
            .update({
                granted_principals: JSON.stringify([]),
                updated_at: new Date(),
            });
    }

    async transaction<T>(callback: (tx: Knex) => Promise<T>): Promise<T> {
        return this.database.transaction(callback);
    }

    async findChartLocations(
        chartUuids: string[],
    ): Promise<ContentReviewContentLocation[]> {
        if (chartUuids.length === 0) return [];
        const rows = await this.database(SavedChartsTableName)
            .leftJoin(
                SpaceTableName,
                `${SavedChartsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .whereIn(`${SavedChartsTableName}.saved_query_uuid`, chartUuids)
            .select<DbLocationRow[]>(
                `${SavedChartsTableName}.saved_query_uuid as uuid`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.slug`,
                `${SpaceTableName}.space_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
                `${SavedChartsTableName}.deleted_at`,
            );
        return rows.map(parseLocationRow);
    }

    async findSqlChartLocations(
        sqlChartUuids: string[],
    ): Promise<ContentReviewContentLocation[]> {
        if (sqlChartUuids.length === 0) return [];
        const rows = await this.database(SavedSqlTableName)
            .whereIn(`${SavedSqlTableName}.saved_sql_uuid`, sqlChartUuids)
            .select<DbLocationRow[]>(
                `${SavedSqlTableName}.saved_sql_uuid as uuid`,
                `${SavedSqlTableName}.name`,
                `${SavedSqlTableName}.slug`,
                `${SavedSqlTableName}.space_uuid`,
                `${SavedSqlTableName}.dashboard_uuid`,
                `${SavedSqlTableName}.deleted_at`,
            );
        return rows.map(parseLocationRow);
    }

    async findDashboardLocations(
        dashboardUuids: string[],
    ): Promise<ContentReviewContentLocation[]> {
        if (dashboardUuids.length === 0) return [];
        const rows = await this.database(DashboardsTableName)
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .whereIn(`${DashboardsTableName}.dashboard_uuid`, dashboardUuids)
            .select<DbLocationRow[]>(
                `${DashboardsTableName}.dashboard_uuid as uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.slug`,
                `${SpaceTableName}.space_uuid`,
                this.database.raw('null as dashboard_uuid'),
                `${DashboardsTableName}.deleted_at`,
            );
        return rows.map(parseLocationRow);
    }

    async findSpaceInfo(
        spaceUuids: string[],
    ): Promise<Map<string, ContentReviewSpaceInfo>> {
        if (spaceUuids.length === 0) return new Map();
        const rows = await this.database(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .whereIn(`${SpaceTableName}.space_uuid`, spaceUuids)
            .select<
                {
                    space_uuid: string;
                    name: string;
                    project_uuid: string;
                    is_default_user_space: boolean;
                    deleted_at: Date | null;
                }[]
            >(
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name`,
                `${ProjectTableName}.project_uuid`,
                `${SpaceTableName}.is_default_user_space`,
                `${SpaceTableName}.deleted_at`,
            );
        return new Map(
            rows.map((row) => [
                row.space_uuid,
                {
                    uuid: row.space_uuid,
                    name: row.name,
                    projectUuid: row.project_uuid,
                    isDefaultUserSpace: row.is_default_user_space,
                    deleted: row.deleted_at !== null,
                },
            ]),
        );
    }

    // Name-based lookalikes in shared spaces: exact compact match first,
    // containment next, then full-text rank on the name
    async findSimilarByName({
        projectUuid,
        contentType,
        name,
        excludeContentUuid,
        limit,
    }: {
        projectUuid: string;
        contentType: ContentReviewContentType;
        name: string;
        excludeContentUuid: string | null;
        limit: number;
    }): Promise<ContentReviewSimilarCandidate[]> {
        const compact = compactContentSearchText(name);
        const trimmed = name.trim();
        if (compact.length === 0 && trimmed.length === 0) return [];
        // Any shared word counts as similar; ts_rank orders the overlap
        const wordQuery = trimmed
            .split(/\s+/)
            .filter((word) => word.length > 0)
            .join(' OR ');
        // A chart duplicate can live in either chart table
        const sources =
            contentType === ContentReviewContentType.DASHBOARD
                ? [SIMILAR_SOURCES.dashboard]
                : [SIMILAR_SOURCES.chart, SIMILAR_SOURCES.sqlChart];
        const results = await Promise.all(
            sources.map((source) =>
                this.findSimilarInSource({
                    source,
                    projectUuid,
                    compact,
                    wordQuery,
                    excludeContentUuid,
                    limit,
                }),
            ),
        );
        return results
            .flat()
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
            .slice(0, limit);
    }

    private async findSimilarInSource({
        source,
        projectUuid,
        compact,
        wordQuery,
        excludeContentUuid,
        limit,
    }: {
        source: SimilarSource;
        projectUuid: string;
        compact: string;
        wordQuery: string;
        excludeContentUuid: string | null;
        limit: number;
    }): Promise<ContentReviewSimilarCandidate[]> {
        const { table, uuidColumn } = source;
        const nameColumn = `${table}.name`;

        const scoreSql = this.database.raw(
            `CASE
                WHEN ${COMPACT_NAME_SQL} = ? THEN ${EXACT_NAME_SCORE}
                WHEN ? <> '' AND (${COMPACT_NAME_SQL} LIKE '%' || ? || '%' OR ? LIKE '%' || ${COMPACT_NAME_SQL} || '%') THEN ${CONTAINED_NAME_SCORE}
                ELSE 0
            END + COALESCE(ts_rank_cd(??, websearch_to_tsquery('lightdash_english_config', ?), 32), 0)`,
            [
                nameColumn,
                compact,
                compact,
                nameColumn,
                compact,
                compact,
                nameColumn,
                `${table}.search_vector`,
                wordQuery,
            ],
        );

        const query = this.database(table)
            .innerJoin(
                SpaceTableName,
                source.spaceJoin.left,
                source.spaceJoin.right,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .where(`${SpaceTableName}.is_default_user_space`, false)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .whereNull(`${table}.deleted_at`)
            .where((builder) => {
                void builder.whereRaw(
                    `?? @@ websearch_to_tsquery('lightdash_english_config', ?)`,
                    [`${table}.search_vector`, wordQuery],
                );
                if (compact.length > 0) {
                    void builder
                        .orWhereRaw(`${COMPACT_NAME_SQL} LIKE ?`, [
                            nameColumn,
                            `%${compact}%`,
                        ])
                        .orWhereRaw(
                            `? LIKE '%' || ${COMPACT_NAME_SQL} || '%'`,
                            [compact, nameColumn],
                        );
                }
            })
            .select<
                {
                    uuid: string;
                    name: string;
                    slug: string;
                    space_uuid: string;
                    space_name: string;
                    score: number;
                }[]
            >(
                `${table}.${uuidColumn} as uuid`,
                `${table}.name`,
                `${table}.slug`,
                `${SpaceTableName}.space_uuid`,
                this.database.ref(`${SpaceTableName}.name`).as('space_name'),
                this.database.raw('(?) as score', [scoreSql]),
            )
            .orderBy('score', 'desc')
            .orderBy(`${table}.name`, 'asc')
            .limit(limit);
        if (excludeContentUuid !== null) {
            void query.whereNot(`${table}.${uuidColumn}`, excludeContentUuid);
        }
        const rows = await query;
        return rows
            .map((row) => ({
                contentType: source.contentType,
                uuid: row.uuid,
                name: row.name,
                slug: row.slug,
                spaceUuid: row.space_uuid,
                spaceName: row.space_name,
                score: Number(row.score),
            }))
            .filter((row) => row.score > 0);
    }
}
