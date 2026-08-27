import {
    type DirectAccessGrant,
    type DirectAccessList,
    type DirectAccessListFilters,
    type KnexPaginateArgs,
    type SessionUser,
    type SpaceMemberRole,
} from '@lightdash/common';

type ResourceAccessInput = {
    user: SessionUser;
    projectUuid: string;
    resourceUuid: string;
};

/**
 * Concrete artifact contract consumed by the shared direct-access controller.
 * Revokes are idempotent: a missing grant succeeds without an audit event,
 * while an unknown or inaccessible resource still fails closed.
 */
export type ResourceAccessHandler = {
    listAccess(
        input: ResourceAccessInput & {
            paginateArgs?: KnexPaginateArgs;
            filters?: DirectAccessListFilters;
        },
    ): Promise<DirectAccessList>;
    replaceUserRole(
        input: ResourceAccessInput & {
            userUuid: string;
            role: SpaceMemberRole;
        },
    ): Promise<DirectAccessGrant>;
    replaceGroupRole(
        input: ResourceAccessInput & {
            groupUuid: string;
            role: SpaceMemberRole;
        },
    ): Promise<DirectAccessGrant>;
    revokeUser(
        input: ResourceAccessInput & { userUuid: string },
    ): Promise<void>;
    revokeGroup(
        input: ResourceAccessInput & { groupUuid: string },
    ): Promise<void>;
    reset(input: ResourceAccessInput): Promise<void>;
};
