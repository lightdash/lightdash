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
          origin: DirectAccessOrigin.USER;
          principal: DirectAccessUserPrincipal;
          directRole: SpaceMemberRole;
          /** Highest additive access role. Capability scopes are enforced separately. */
          effectiveRole: SpaceMemberRole;
      }
    | {
          origin: DirectAccessOrigin.GROUP;
          principal: DirectAccessGroupPrincipal;
          directRole: SpaceMemberRole;
          /** A group's member-effective roles vary; this is the group's direct contribution. */
          effectiveRole: SpaceMemberRole;
      };

export type DirectAccessListFilters = {
    searchQuery?: string;
};

export type DirectAccessList = KnexPaginatedData<DirectAccessGrant[]>;
