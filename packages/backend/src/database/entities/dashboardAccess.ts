import { type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';

export const DashboardUserAccessTableName = 'dashboard_user_access';
export const DashboardGroupAccessTableName = 'dashboard_group_access';

export type DbDashboardUserAccess = {
    dashboard_uuid: string;
    user_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DashboardUserAccessTable = Knex.CompositeTableType<
    DbDashboardUserAccess,
    Omit<DbDashboardUserAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbDashboardUserAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;

export type DbDashboardGroupAccess = {
    dashboard_uuid: string;
    group_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DashboardGroupAccessTable = Knex.CompositeTableType<
    DbDashboardGroupAccess,
    Omit<DbDashboardGroupAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbDashboardGroupAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;
