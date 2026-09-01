import {
    ContentReviewRequestStatus,
    NotFoundError,
    type ContentReviewContentType,
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
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';

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
}
