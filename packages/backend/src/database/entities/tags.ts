import type { Tag } from '@lightdash/common';
import type { Knex } from 'knex';
import type { DbUser } from './users';

export type DbTag = {
    tag_uuid: string;
    project_uuid: string;
    name: string;
    color: string;
    created_by_user_uuid: string | null;
    created_at: Date;
};

export type DbTagIn = Pick<
    DbTag,
    'project_uuid' | 'name' | 'color' | 'created_by_user_uuid'
>;

export type DbTagUpdate = Partial<Pick<DbTag, 'name' | 'color'>>;

export type TagsTable = Knex.CompositeTableType<DbTag, DbTagIn, DbTagUpdate>;

export const TagsTableName = 'tags';

export const convertTagRow = (tag: DbTag & DbUser): Tag => ({
    tagUuid: tag.tag_uuid,
    projectUuid: tag.project_uuid,
    name: tag.name,
    color: tag.color,
    createdAt: tag.created_at,
    createdBy: {
        userUuid: tag.user_uuid,
        firstName: tag.first_name,
        lastName: tag.last_name,
    },
});
