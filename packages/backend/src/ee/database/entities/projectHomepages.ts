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
        | 'updated_at'
    >
>;

export type ProjectHomepagesTable = Knex.CompositeTableType<
    DbProjectHomepage,
    DbProjectHomepageIn,
    DbProjectHomepageUpdate
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
    'project_uuid' | 'homepage_uuid' | 'target_type' | 'group_uuid' | 'role' | 'priority'
>;

export type DbHomepageAssignmentUpdate = Partial<
    Pick<DbHomepageAssignment, 'priority'>
>;

export type HomepageAssignmentsTable = Knex.CompositeTableType<
    DbHomepageAssignment,
    DbHomepageAssignmentIn,
    DbHomepageAssignmentUpdate
>;
