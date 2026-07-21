import { type HomepageConfig } from '@lightdash/common';
import { type Knex } from 'knex';

export const HomepagesTableName = 'homepages';

export type DbProjectHomepage = {
    homepage_uuid: string;
    project_uuid: string;
    name: string;
    draft_config: HomepageConfig;
    published_config: HomepageConfig | null;
    is_default: boolean;
    allow_personal: boolean;
    created_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbProjectHomepageIn = Pick<
    DbProjectHomepage,
    | 'project_uuid'
    | 'name'
    | 'draft_config'
    | 'is_default'
    | 'created_by_user_uuid'
>;

export type DbProjectHomepageUpdate = Partial<
    Pick<
        DbProjectHomepage,
        | 'name'
        | 'draft_config'
        | 'published_config'
        | 'is_default'
        | 'allow_personal'
        | 'updated_at'
    >
>;

export type ProjectHomepagesTable = Knex.CompositeTableType<
    DbProjectHomepage,
    DbProjectHomepageIn,
    DbProjectHomepageUpdate
>;

export const HomepagePersonalOverridesTableName = 'homepage_personal_overrides';

export type DbHomepagePersonalOverride = {
    user_uuid: string;
    project_uuid: string;
    dashboard_uuid: string;
    created_at: Date;
};

export type HomepagePersonalOverridesTable = Knex.CompositeTableType<
    DbHomepagePersonalOverride,
    Pick<
        DbHomepagePersonalOverride,
        'user_uuid' | 'project_uuid' | 'dashboard_uuid'
    >,
    Pick<DbHomepagePersonalOverride, 'dashboard_uuid'>
>;

export const HomepageAssignmentsTableName = 'homepage_assignments';

export type DbHomepageAssignment = {
    assignment_uuid: string;
    project_uuid: string;
    homepage_uuid: string;
    target_type: 'group' | 'role';
    group_uuid: string | null;
    role: string | null;
    priority: number;
    created_at: Date;
};

export type DbHomepageAssignmentIn = Pick<
    DbHomepageAssignment,
    | 'project_uuid'
    | 'homepage_uuid'
    | 'target_type'
    | 'group_uuid'
    | 'role'
    | 'priority'
>;

export type DbHomepageAssignmentUpdate = Partial<
    Pick<DbHomepageAssignment, 'priority'>
>;

export type HomepageAssignmentsTable = Knex.CompositeTableType<
    DbHomepageAssignment,
    DbHomepageAssignmentIn,
    DbHomepageAssignmentUpdate
>;

export const AnnouncementsTableName = 'project_announcements';

export type DbAnnouncement = {
    announcement_uuid: string;
    project_uuid: string;
    title: string;
    body: string | null;
    category: string | null;
    pinned: boolean;
    created_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
    published_at: Date | null;
    pending_slack_channel_id: string | null;
};

export type DbAnnouncementIn = Pick<
    DbAnnouncement,
    'project_uuid' | 'title' | 'body' | 'created_by_user_uuid'
> &
    Partial<
        Pick<
            DbAnnouncement,
            'category' | 'published_at' | 'pending_slack_channel_id'
        >
    >;

export type DbAnnouncementUpdate = Partial<
    Pick<
        DbAnnouncement,
        | 'title'
        | 'body'
        | 'category'
        | 'pinned'
        | 'updated_at'
        | 'published_at'
        | 'pending_slack_channel_id'
    >
>;

export type AnnouncementsTable = Knex.CompositeTableType<
    DbAnnouncement,
    DbAnnouncementIn,
    DbAnnouncementUpdate
>;
