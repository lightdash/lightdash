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
        'name' | 'draft_config' | 'published_config' | 'updated_at'
    >
>;

export type ProjectHomepagesTable = Knex.CompositeTableType<
    DbProjectHomepage,
    DbProjectHomepageIn,
    DbProjectHomepageUpdate
>;
