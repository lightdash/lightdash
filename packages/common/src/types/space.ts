// eslint-disable-next-line import/no-cycle
import { type SpaceDashboard } from './dashboard';
import { type OrganizationMemberRole } from './organizationMemberProfile';
import { type ProjectMemberRole } from './projectMemberRole';
// eslint-disable-next-line import/no-cycle
import { type SpaceQuery } from './savedCharts';

export type Space = {
    organizationUuid: string;
    uuid: string;
    name: string;
    isPrivate: boolean;
    queries: SpaceQuery[];
    projectUuid: string;
    dashboards: SpaceDashboard[];
    access: SpaceShare[];
    groupsAccess: SpaceGroup[];
    pinnedListUuid: string | null;
    pinnedListOrder: number | null;
    slug: string;
    // Nested Spaces MVP - disables nested spaces' access changes
    childSpaces: Omit<SpaceSummary, 'userAccess'>[];
    parentSpaceUuid: string | null;
    inheritParentPermissions: boolean;
    // ltree path serialized as string
    path: string;
    breadcrumbs?: {
        name: string;
        uuid: string;
        /** Whether the current user has access to this space. undefined treated as true for backwards compat */
        hasAccess?: boolean;
    }[];
};

export type SpaceSummary = Pick<
    Space,
    | 'organizationUuid'
    | 'projectUuid'
    | 'uuid'
    | 'name'
    | 'isPrivate'
    | 'inheritParentPermissions'
    | 'pinnedListUuid'
    | 'pinnedListOrder'
    | 'slug'
    | 'parentSpaceUuid'
    | 'path'
> & {
    userAccess: SpaceShare | undefined;
    access: string[];
    chartCount: number;
    dashboardCount: number;
};

export type CreateSpace = {
    name: string;
    isPrivate?: boolean;
    access?: Pick<SpaceShare, 'userUuid' | 'role'>[];
    parentSpaceUuid?: string;
    inheritParentPermissions?: boolean;
};

export type UpdateSpace = {
    name: string;
    isPrivate?: boolean;
    inheritParentPermissions?: boolean;
};

export type SpaceShare = {
    userUuid: string;
    firstName: string;
    lastName: string;
    email: string;
    role: SpaceMemberRole;
    hasDirectAccess: boolean;
    projectRole: ProjectMemberRole | undefined;
    inheritedRole: OrganizationMemberRole | ProjectMemberRole | undefined;
    inheritedFrom:
        | 'organization'
        | 'project'
        | 'group'
        | 'space_group'
        | 'parent_space'
        | undefined;
};

export type SpaceGroup = {
    groupUuid: string;
    groupName: string;
    spaceRole: SpaceMemberRole;
};

export enum SpaceMemberRole {
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

export type ApiSpaceSummaryListResponse = {
    status: 'ok';
    results: SpaceSummary[];
};

export type ApiSpaceResponse = {
    status: 'ok';
    results: Space;
};

export type AddSpaceUserAccess = {
    userUuid: string;
    spaceRole: SpaceMemberRole;
};

export type AddSpaceGroupAccess = {
    groupUuid: string;
    spaceRole: SpaceMemberRole;
};

/**
 * Impact data shown when deleting a space that has nested child spaces.
 * Used for the delete confirmation modal.
 */
export type SpaceDeleteImpact = {
    space: Omit<SpaceSummary, 'userAccess'>;
    childSpaces: Array<{
        uuid: string;
        name: string;
        hasAccess: boolean;
        chartCount: number;
        dashboardCount: number;
    }>;
    totalCharts: number;
    totalDashboards: number;
};

export type ApiSpaceDeleteImpactResponse = {
    status: 'ok';
    results: SpaceDeleteImpact;
};
