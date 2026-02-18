// eslint-disable-next-line import/no-cycle
import { type SpaceDashboard } from './dashboard';
import { type OrganizationMemberRole } from './organizationMemberProfile';
import { type ProjectMemberRole } from './projectMemberRole';
// eslint-disable-next-line import/no-cycle
import { type SpaceQuery } from './savedCharts';

// Permissions added directly to a space (not inherited from parent/orgs/projects)
export enum DirectSpaceAccessOrigin {
    USER_ACCESS = 'user_access',
    GROUP_ACCESS = 'group_access',
}
export type DirectSpaceAccess = {
    userUuid: string;
    spaceUuid: string;
    role: SpaceMemberRole;
    from: DirectSpaceAccessOrigin;
};

export type OrganizationSpaceAccess = {
    userUuid: string;
    spaceUuid: string;
    role: OrganizationMemberRole;
};

export enum ProjectSpaceAccessOrigin {
    PROJECT_MEMBERSHIP = 'project_membership',
    GROUP_MEMBERSHIP = 'group_membership',
}

export type ProjectSpaceAccess = {
    userUuid: string;
    spaceUuid: string;
    role: ProjectMemberRole;
    from: ProjectSpaceAccessOrigin;
};

export type SpaceAccessInput = {
    spaceUuid: string;
    inheritParentPermissions: boolean;
    directAccess: DirectSpaceAccess[];
    projectAccess: ProjectSpaceAccess[];
    organizationAccess: OrganizationSpaceAccess[];
};

export type ChainSpaceDirectAccess = {
    spaceUuid: string;
    directAccess: DirectSpaceAccess[];
};

export type SpaceAccessWithInheritanceInput = {
    spaceUuid: string;
    isPrivate: boolean;
    chainDirectAccess: ChainSpaceDirectAccess[];
    projectAccess: ProjectSpaceAccess[];
    organizationAccess: OrganizationSpaceAccess[];
};

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
    childSpaces: SpaceSummaryBase[];
    parentSpaceUuid: string | null;
    inheritParentPermissions: boolean;
    // ltree path serialized as string
    path: string;
    breadcrumbs?: {
        name: string;
        uuid: string;
    }[];
};

// Base space summary without access data — returned by SpaceModel.find().
// Use SpaceSummary for API responses that include access info.
export type SpaceSummaryBase = Pick<
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
    chartCount: number;
    dashboardCount: number;
    deletedAt?: Date;
    deletedBy?: {
        userUuid: string;
        firstName: string;
        lastName: string;
    };
};

export type SpaceSummary = SpaceSummaryBase & {
    userAccess: SpaceAccess | undefined;
    access: string[];
};

export type CreateSpace = {
    name: string;
    isPrivate?: boolean;
    inheritParentPermissions?: boolean;
    access?: Pick<SpaceShare, 'userUuid' | 'role'>[];
    parentSpaceUuid?: string;
};

export type UpdateSpace = {
    name: string;
    isPrivate?: boolean;
    inheritParentPermissions?: boolean;
};

export type SpaceAccessUserMetadata = {
    firstName: string;
    lastName: string;
    email: string;
};

export type SpaceInheritanceChainItem = {
    spaceUuid: string;
    spaceName: string;
    inheritParentPermissions: boolean;
};

export type SpaceInheritanceChain = {
    /** Spaces from leaf to the first inherit=false ancestor (or root). */
    chain: SpaceInheritanceChainItem[];
    /** True if the chain reaches a root space that inherits from the project/org. */
    inheritsFromOrgOrProject: boolean;
};

// Access data for checking Space access permissions with CASL where only the role/access data matters.
export type SpaceAccess = {
    userUuid: string;
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

// Full space share with user metadata, used for frontend display
export type SpaceShare = SpaceAccess & SpaceAccessUserMetadata;

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
