import { SpaceDashboard } from './dashboard';
import { ProjectMemberRole } from './projectMemberProfile';
import { SpaceQuery } from './savedCharts';

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
};

export type SpaceSummary = Pick<
    Space,
    'organizationUuid' | 'projectUuid' | 'uuid' | 'name' | 'isPrivate'
> & {
    access: string[];
};

export type CreateSpace = {
    name: string;
    isPrivate?: boolean;
    access: SpaceShare[];
};

export type UpdateSpace = {
    name: string;
    isPrivate: boolean;
};

export type SpaceShare = {
    userUuid: string;
    firstName: string;
    lastName: string;
    role: ProjectMemberRole;
};

export type ApiSpaceSummaryListResponse = {
    status: 'ok';
    results: SpaceSummary[];
};

export type ApiSpaceResponse = {
    status: 'ok';
    results: Space;
};

export type AddSpaceShare = {
    userUuid: string;
};
