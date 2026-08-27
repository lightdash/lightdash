import type {
    DirectAccessGrant,
    DirectAccessList,
    DirectAccessListFilters,
    KnexPaginateArgs,
    SessionUser,
    SpaceMemberRole,
} from '@lightdash/common';

export type ResourceAccessInput = {
    user: SessionUser;
    projectUuid: string;
    resourceUuid: string;
};

export interface ResourceAccessHandler {
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

    revokeUser(
        input: ResourceAccessInput & { userUuid: string },
    ): Promise<void>;

    replaceGroupRole(
        input: ResourceAccessInput & {
            groupUuid: string;
            role: SpaceMemberRole;
        },
    ): Promise<DirectAccessGrant>;

    revokeGroup(
        input: ResourceAccessInput & { groupUuid: string },
    ): Promise<void>;

    reset(input: ResourceAccessInput): Promise<void>;
}
