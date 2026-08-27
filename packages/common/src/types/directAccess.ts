import { type KnexPaginatedData } from './knex-paginate';
import { type SpaceMemberRole } from './space';

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
          /** Highest additive role before capability scopes are applied. */
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
