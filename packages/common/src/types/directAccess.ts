import { type UUID } from './api/uuid';
import { type SpaceMemberRole } from './space';

/**
 * Closed registry of resource types that support direct access grants.
 * Growing this union means adding a resource registry entry, an
 * `AccessTarget` mapping, and grant tables — never a new handler hierarchy.
 */
export enum DirectAccessResourceType {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
    SQL_CHART = 'sqlChart',
    APP = 'app',
}

export enum DirectAccessPrincipalType {
    USER = 'user',
    GROUP = 'group',
}

export type DirectAccessUserPrincipal = {
    type: DirectAccessPrincipalType.USER;
    userUuid: UUID;
    firstName: string;
    lastName: string;
    email: string | null;
};

export type DirectAccessGroupPrincipal = {
    type: DirectAccessPrincipalType.GROUP;
    groupUuid: UUID;
    name: string;
};

export type DirectAccessPrincipal =
    | DirectAccessUserPrincipal
    | DirectAccessGroupPrincipal;

/**
 * One persisted direct assignment. Reflects stored policy only — inherited
 * space/project/organization roles are never reconstructed into this shape.
 */
export type DirectAccessAssignment = {
    principal: DirectAccessPrincipal;
    role: SpaceMemberRole;
    grantedByUserUuid: UUID | null;
    createdAt: Date;
    updatedAt: Date;
};

/** Principal reference used by administration requests and imports. */
export type DirectAccessPrincipalRef = {
    type: DirectAccessPrincipalType;
    uuid: UUID;
};

export type UpsertDirectAccessAssignmentRequest = {
    role: SpaceMemberRole;
};

export type ApiDirectAccessAssignmentsResponse = {
    status: 'ok';
    results: DirectAccessAssignment[];
};
