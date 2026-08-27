import type { KnexPaginatedData } from './knex-paginate';
import type { SpaceMemberRole } from './space';

export const DIRECT_ACCESS_RESOURCE_TYPES = [
    'dashboard',
    'savedChart',
    'savedSqlChart',
    'dataApp',
] as const;

export type DirectAccessResourceType =
    (typeof DIRECT_ACCESS_RESOURCE_TYPES)[number];

export enum DirectAccessOrigin {
    USER = 'user',
    GROUP = 'group',
}

export type DirectAccessUserPrincipal = {
    type: DirectAccessOrigin.USER;
    uuid: string;
    firstName: string;
    lastName: string;
    email: string;
    isInternal: boolean;
};

export type DirectAccessGroupPrincipal = {
    type: DirectAccessOrigin.GROUP;
    uuid: string;
    name: string;
};

export type DirectAccessGrant =
    | {
          principal: DirectAccessUserPrincipal;
          directRole: SpaceMemberRole;
          /** Highest additive resource role before capability scopes. */
          effectiveRole: SpaceMemberRole;
      }
    | {
          principal: DirectAccessGroupPrincipal;
          directRole: SpaceMemberRole;
      };

export type DirectAccessListFilters = {
    searchQuery?: string;
};

export type DirectAccessList = KnexPaginatedData<DirectAccessGrant[]>;

export type DirectAccessRoleAssignment = {
    role: SpaceMemberRole;
};

export type ApiDirectAccessListResponse = {
    status: 'ok';
    results: DirectAccessList;
};

export type ApiDirectAccessGrantResponse = {
    status: 'ok';
    results: DirectAccessGrant;
};
