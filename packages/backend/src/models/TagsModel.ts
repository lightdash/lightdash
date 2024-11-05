import type { Tag } from '@lightdash/common';
import { Knex } from 'knex';
import {
    convertTagRow,
    TagsTableName,
    type DbTag,
    type DbTagIn,
} from '../database/entities/tags';
import { UserTableName } from '../database/entities/users';

export class TagsModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(tagIn: DbTagIn) {
        return this.database(TagsTableName).insert(tagIn);
    }

    async delete(tagUuid: string) {
        return this.database(TagsTableName).where('tag_uuid', tagUuid).delete();
    }

    async get(tagUuid: string): Promise<Tag | undefined> {
        const tag = await this.database(TagsTableName)
            .join(
                UserTableName,
                `${TagsTableName}.created_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where('tag_uuid', tagUuid)
            .first();
        return tag ? convertTagRow(tag) : undefined;
    }

    async list(projectUuid: string): Promise<Tag[]> {
        const tags = await this.database(TagsTableName)
            .join(
                UserTableName,
                `${TagsTableName}.created_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where('project_uuid', projectUuid)
            .select('*');

        return tags.map(convertTagRow);
    }
}
