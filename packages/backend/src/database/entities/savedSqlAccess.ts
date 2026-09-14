import { type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';

export const SavedSqlUserAccessTableName = 'saved_sql_user_access';
export const SavedSqlGroupAccessTableName = 'saved_sql_group_access';

export type DbSavedSqlUserAccess = {
    saved_sql_uuid: string;
    user_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type SavedSqlUserAccessTable = Knex.CompositeTableType<
    DbSavedSqlUserAccess,
    Omit<DbSavedSqlUserAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbSavedSqlUserAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;

export type DbSavedSqlGroupAccess = {
    saved_sql_uuid: string;
    group_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type SavedSqlGroupAccessTable = Knex.CompositeTableType<
    DbSavedSqlGroupAccess,
    Omit<DbSavedSqlGroupAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbSavedSqlGroupAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;
