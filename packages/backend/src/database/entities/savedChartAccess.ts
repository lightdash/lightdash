import { type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';

export const SavedChartUserAccessTableName = 'saved_chart_user_access';
export const SavedChartGroupAccessTableName = 'saved_chart_group_access';

export type DbSavedChartUserAccess = {
    saved_chart_uuid: string;
    user_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type SavedChartUserAccessTable = Knex.CompositeTableType<
    DbSavedChartUserAccess,
    Omit<DbSavedChartUserAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbSavedChartUserAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;

export type DbSavedChartGroupAccess = {
    saved_chart_uuid: string;
    group_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type SavedChartGroupAccessTable = Knex.CompositeTableType<
    DbSavedChartGroupAccess,
    Omit<DbSavedChartGroupAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbSavedChartGroupAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;
