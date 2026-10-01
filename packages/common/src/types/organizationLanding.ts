import { type OrganizationMemberRole } from './organizationMemberProfile';
import { type UserAllowedOrganization } from './user';

export enum OrganizationJoinRequestStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    DECLINED = 'declined',
    EXPIRED = 'expired',
}

export const ORGANIZATION_JOIN_REQUEST_TTL_DAYS = 14;
export const ORGANIZATION_JOIN_REQUEST_DAILY_LIMIT = 5;

export type OrganizationJoinRequestSummary = {
    joinRequestUuid: string;
    status: OrganizationJoinRequestStatus;
    createdAt: Date;
    decidedAt: Date | null;
};

export type OrganizationLandingMatch = {
    organizationUuid: string;
    name: string;
    hasAdmin: boolean;
    membersCount: number;
    joinRequest: OrganizationJoinRequestSummary | null;
};

export type OrganizationLanding = {
    emailDomain: string;
    isEmailVerified: boolean;
    canCreateOrganization: boolean;
    joinable: UserAllowedOrganization[];
    requestable: OrganizationLandingMatch[];
};

export type ApiOrganizationLandingResponse = {
    status: 'ok';
    results: OrganizationLanding;
};

export type CreateOrganizationJoinRequest = {
    organizationUuid: string;
};

export type ApiOrganizationJoinRequestResponse = {
    status: 'ok';
    results: OrganizationJoinRequestSummary;
};

export type OrganizationJoinRequest = {
    joinRequestUuid: string;
    organizationUuid: string;
    user: {
        userUuid: string;
        email: string;
        firstName: string;
        lastName: string;
    };
    createdAt: Date;
    expiresAt: Date;
};

export type ApiOrganizationJoinRequestsResponse = {
    status: 'ok';
    results: OrganizationJoinRequest[];
};

export type ApproveOrganizationJoinRequest = {
    role: OrganizationMemberRole;
};

export const getOrganizationJoinRequestExpiry = (createdAt: Date): Date =>
    new Date(
        createdAt.getTime() +
            ORGANIZATION_JOIN_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

export const getOrganizationJoinRequestStatus = (
    request: {
        status: OrganizationJoinRequestStatus;
        expiresAt: Date;
    },
    now: Date,
): OrganizationJoinRequestStatus =>
    request.status === OrganizationJoinRequestStatus.PENDING &&
    request.expiresAt <= now
        ? OrganizationJoinRequestStatus.EXPIRED
        : request.status;

export const isOrganizationJoinRequestLimitReached = (
    createdInLastDay: number,
): boolean => createdInLastDay >= ORGANIZATION_JOIN_REQUEST_DAILY_LIMIT;
