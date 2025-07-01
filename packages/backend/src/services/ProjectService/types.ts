import { Account, SessionUser } from '@lightdash/common';

type ExploreParamsBase = {
    projectUuid: string;
    exploreName: string;
    organizationUuid?: string;
    includeUnfilteredTables?: boolean;
};

type ExploreParamsWithUser = ExploreParamsBase & {
    user: SessionUser;
    account?: never;
};

type ExploreParamsWithAccount = ExploreParamsBase & {
    account: Account;
    user?: never;
};

export type GetExploreParams = ExploreParamsWithUser | ExploreParamsWithAccount;

export type GetUserAttributesParams = {
    user?: SessionUser;
    account?: Account;
    organizationUuid?: string;
};
