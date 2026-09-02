import {
    type DirectAccessPrincipalRef,
    type DirectAccessResourceType,
} from './directAccess';

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
