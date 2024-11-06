import type { Tag } from '@lightdash/common';
import { Knex } from 'knex';
import {
    convertTagRow,
    TagsTableName,
    type DbTagIn,
    type DbTagUpdate,
} from '../database/entities/tags';
import { UserTableName } from '../database/entities/users';

export class TagsModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(tagIn: DbTagIn) {
        const [result] = await this.database(TagsTableName)
            .insert(tagIn)
            .returning('tag_uuid');

        return result;
    }

    async delete(tagUuid: string) {
        return this.database(TagsTableName).where('tag_uuid', tagUuid).delete();
    }

    async update(tagUuid: string, tagUpdate: DbTagUpdate) {
        await this.database(TagsTableName)
            .where('tag_uuid', tagUuid)
            .update(tagUpdate);
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
