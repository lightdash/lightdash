import { Knex } from 'knex';

export const ContentReviewRequestsTableName = 'content_review_requests';

export type DbContentReviewRequest = {
    content_review_request_uuid: string;
    project_uuid: string;
    content_type: string;
    content_uuid: string;
    source_space_uuid: string;
    target_space_uuid: string | null;
    requested_by_user_uuid: string;
    request_note: string | null;
    similar_content: object;
    status: string;
    reviewed_by_user_uuid: string | null;
    reviewed_at: Date | null;
    review_note: string | null;
    verified_on_approve: boolean | null;
    moved_content: object;
    granted_principals: object;
    created_at: Date;
    updated_at: Date;
};

// jsonb arrays are written serialized so pg does not read them as arrays
type SerializedJsonColumns = {
    similar_content: string;
    granted_principals: string;
    moved_content: string;
};

export type CreateDbContentReviewRequest = Pick<
    DbContentReviewRequest,
    | 'project_uuid'
    | 'content_type'
    | 'content_uuid'
    | 'source_space_uuid'
    | 'target_space_uuid'
    | 'requested_by_user_uuid'
    | 'request_note'
> &
    Pick<SerializedJsonColumns, 'similar_content' | 'granted_principals'>;

export type UpdateDbContentReviewRequest = Partial<
    Pick<
        DbContentReviewRequest,
        | 'status'
        | 'reviewed_by_user_uuid'
        | 'reviewed_at'
        | 'review_note'
        | 'verified_on_approve'
        | 'updated_at'
    > &
        Pick<SerializedJsonColumns, 'moved_content' | 'granted_principals'>
>;

export type ContentReviewRequestsTable = Knex.CompositeTableType<
    DbContentReviewRequest,
    CreateDbContentReviewRequest,
    UpdateDbContentReviewRequest
>;
