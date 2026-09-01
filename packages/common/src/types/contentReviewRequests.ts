import {
    type DirectAccessPrincipalRef,
    type DirectAccessResourceType,
} from './directAccess';
import { type KnexPaginatedData } from './knex-paginate';

// Review-specific so SQL charts can be reviewed without widening the
// global content type
export enum ContentReviewContentType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SQL_CHART = 'sql_chart',
}

export enum ContentReviewRequestStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CANCELLED = 'cancelled',
}

export type ContentReviewUser = {
    userUuid: string;
    firstName: string;
    lastName: string;
};

// Shown to the requester at submit time and snapshotted on the request
export type ContentReviewSimilarContentItem = {
    contentType: ContentReviewContentType;
    contentUuid: string;
    name: string;
    slug: string;
    spaceUuid: string;
    spaceName: string;
    isVerified: boolean;
    score: number;
};

export type ContentReviewMovedItem = {
    contentType: ContentReviewContentType;
    contentUuid: string;
    name: string;
};

// A direct-access grant written on submit so reviewers can open the content
export type ContentReviewGrantedPrincipal = {
    resourceType: DirectAccessResourceType;
    resourceUuid: string;
    principal: DirectAccessPrincipalRef;
};

export type ContentReviewRequest = {
    uuid: string;
    projectUuid: string;
    contentType: ContentReviewContentType;
    contentUuid: string;
    sourceSpaceUuid: string;
    targetSpaceUuid: string | null;
    requestedBy: ContentReviewUser;
    requestNote: string | null;
    similarContent: ContentReviewSimilarContentItem[];
    status: ContentReviewRequestStatus;
    reviewedBy: ContentReviewUser | null;
    reviewedAt: Date | null;
    reviewNote: string | null;
    verifiedOnApprove: boolean | null;
    movedContent: ContentReviewMovedItem[];
    grantedPrincipals: ContentReviewGrantedPrincipal[];
    createdAt: Date;
    updatedAt: Date;
};

export type ContentReviewSettings = {
    projectUuid: string;
    reviewerGroupUuid: string | null;
    verifyOnApproveDefault: boolean;
    slackChannelId: string | null;
};

export type UpdateContentReviewSettings = Partial<
    Omit<ContentReviewSettings, 'projectUuid'>
>;

export enum ContentReviewRequestView {
    TO_REVIEW = 'to-review',
    MINE = 'mine',
}

export type CreateContentReviewRequestBody = {
    contentType: ContentReviewContentType;
    contentUuid: string;
    targetSpaceUuid: string;
    note: string | null;
    similarContent: ContentReviewSimilarContentItem[];
};

export type ApproveContentReviewRequestBody = {
    verify: boolean;
    note: string | null;
};

export type RejectContentReviewRequestBody = {
    note: string;
};

// Null when the content was deleted after the request was made
export type ContentReviewContentSummary = {
    name: string;
    slug: string;
};

export type ContentReviewRequestListItem = ContentReviewRequest & {
    content: ContentReviewContentSummary | null;
    sourceSpaceName: string | null;
    targetSpaceName: string | null;
};

export type ContentReviewRequestDetail = ContentReviewRequestListItem & {
    // What approval would move today, recomputed on every read
    moveSet: ContentReviewMovedItem[];
    canReview: boolean;
    canVerify: boolean;
    verifyByDefault: boolean;
};

export type ApiContentReviewRequestResponse = {
    status: 'ok';
    results: ContentReviewRequestDetail;
};

export type ApiContentReviewRequestOrNullResponse = {
    status: 'ok';
    results: ContentReviewRequest | null;
};

export type ApiContentReviewRequestListResponse = {
    status: 'ok';
    results: KnexPaginatedData<ContentReviewRequestListItem[]>;
};

export type ApiContentReviewSettingsResponse = {
    status: 'ok';
    results: ContentReviewSettings;
};

export enum ContentReviewNotificationEvent {
    SUBMITTED = 'submitted',
    APPROVED = 'approved',
    REJECTED = 'rejected',
}

export const getContentReviewRequestsPath = (projectUuid: string): string =>
    `/projects/${projectUuid}/review-requests`;

export const getContentReviewRequestPath = (
    projectUuid: string,
    requestUuid: string,
): string => `${getContentReviewRequestsPath(projectUuid)}/${requestUuid}`;

export type ApiContentReviewSimilarContentResponse = {
    status: 'ok';
    results: ContentReviewSimilarContentItem[];
};
