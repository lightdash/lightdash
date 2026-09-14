import { type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';

export const AppUserAccessTableName = 'app_user_access';
export const AppGroupAccessTableName = 'app_group_access';

export type DbAppUserAccess = {
    app_uuid: string;
    user_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AppUserAccessTable = Knex.CompositeTableType<
    DbAppUserAccess,
    Omit<DbAppUserAccess, 'created_at' | 'updated_at'>,
    Pick<DbAppUserAccess, 'space_role' | 'granted_by_user_uuid' | 'updated_at'>
>;

export type DbAppGroupAccess = {
    app_uuid: string;
    group_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AppGroupAccessTable = Knex.CompositeTableType<
    DbAppGroupAccess,
    Omit<DbAppGroupAccess, 'created_at' | 'updated_at'>,
    Pick<DbAppGroupAccess, 'space_role' | 'granted_by_user_uuid' | 'updated_at'>
>;
