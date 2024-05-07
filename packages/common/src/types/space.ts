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
    pinnedListUuid: string | null;
    pinnedListOrder: number | null;
    slug: string;
};

export type SpaceSummary = Pick<
    Space,
    | 'organizationUuid'
    | 'projectUuid'
    | 'uuid'
    | 'name'
    | 'isPrivate'
    | 'pinnedListUuid'
    | 'pinnedListOrder'
    | 'slug'
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
};

export type UpdateSpace = {
    name: string;
    isPrivate: boolean;
};

export type SpaceShare = {
    userUuid: string;
    firstName: string;
    lastName: string;
    email: string;
    role: SpaceMemberRole;
    hasDirectAccess: boolean;
    inheritedRole: OrganizationMemberRole | ProjectMemberRole | undefined;
    inheritedFrom: 'organization' | 'project' | 'group' | undefined;
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
