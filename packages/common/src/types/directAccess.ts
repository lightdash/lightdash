import type { KnexPaginatedData } from './knex-paginate';
import type { SpaceMemberRole } from './space';

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

export type DirectAccessPrincipal =
    | DirectAccessUserPrincipal
    | DirectAccessGroupPrincipal;

export type DirectAccessGrant =
    | {
          principal: DirectAccessUserPrincipal;
          directRole: SpaceMemberRole;
          /**
           * Highest additive access role before capability scopes, which are
           * enforced separately at query time.
           */
          effectiveRole: SpaceMemberRole;
      }
    | {
          /**
           * Group grants carry only their direct contribution: each member's
           * effective role varies with their other access paths.
           */
          principal: DirectAccessGroupPrincipal;
          directRole: SpaceMemberRole;
      };

export type DirectAccessListFilters = {
    searchQuery?: string;
};

export type DirectAccessList = KnexPaginatedData<DirectAccessGrant[]>;
