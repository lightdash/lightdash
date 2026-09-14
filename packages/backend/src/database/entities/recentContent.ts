import type { RecentContentType } from '@lightdash/common';
import type { Knex } from 'knex';

export const RecentContentTableName = 'user_recent_content';

export type DbRecentContent = {
    user_uuid: string;
    project_uuid: string;
    content_type: RecentContentType;
    content_uuid: string;
    last_viewed_at: Date;
};

export type RecentContentTable = Knex.CompositeTableType<DbRecentContent>;
