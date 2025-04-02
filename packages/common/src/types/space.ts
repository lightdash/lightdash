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
    testing?: {
        inheritedAccess: {
            email: string;
            first_name: string;
            last_name: string;
            space_uuid: string;
            user_uuid: string;
            organization_role: OrganizationMemberRole;
            project_role: ProjectMemberRole;
            project_group_roles?: ProjectMemberRole[];
        }[];
        groupAccess: {
            group_name: string;
            group_uuid: string;
            space_role: SpaceMemberRole;
            space_uuid: string;
            group_members: {
                user_uuid: string;
                first_name: string;
                last_name: string;
                email: string;
                space_role: SpaceMemberRole;
            }[];
        }[];
        userAccess: {
            email: string;
            first_name: string;
            last_name: string;
            space_uuid: string;
            user_uuid: string;
            space_role: SpaceMemberRole;
        }[];
    };
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
    projectRole: ProjectMemberRole | undefined;
    inheritedRole: OrganizationMemberRole | ProjectMemberRole | undefined;
    inheritedFrom:
        | 'organization'
        | 'project'
        | 'group'
        | 'space_group'
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
