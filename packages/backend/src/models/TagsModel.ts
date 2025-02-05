import type { Tag } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbTag,
    TagsTableName,
    convertTagRow,
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

    async getYamlTags(projectUuid: string): Promise<DbTag[]> {
        const tags = await this.database(TagsTableName)
            .whereNotNull('yaml_reference')
            .andWhere('project_uuid', projectUuid)
            .select('*');

        return tags;
    }

    async replaceYamlTags(
        projectUuid: string,
        yamlTags: DbTagIn[],
    ): Promise<{ yamlTagsToCreateOrUpdate: string[] }> {
        const result: {
            yamlTagsToCreateOrUpdate: string[];
        } = { yamlTagsToCreateOrUpdate: [] };

        await this.database.transaction(async (trx) => {
            // get all yaml tags in the project
            const projectYamlTags = await trx(TagsTableName)
                .whereNotNull('yaml_reference')
                .andWhere('project_uuid', projectUuid);

            // get all yaml tags that are not in the project but are in the yamlTags array
            const yamlTagsToCreate = yamlTags.filter(
                (yamlTag) =>
                    !projectYamlTags.some(
                        (projectYamlTag) =>
                            projectYamlTag.yaml_reference ===
                            yamlTag.yaml_reference,
                    ),
            );

            result.yamlTagsToCreateOrUpdate = yamlTagsToCreate.map(
                (tag) => tag.name,
            );

            // get all updates for the existing project yaml tags
            const yamlTagUpdates = yamlTags.reduce<Record<string, DbTagUpdate>>(
                (acc, yamlTag) => {
                    const projectYamlTag = projectYamlTags.find(
                        (projectTag) =>
                            projectTag.yaml_reference ===
                            yamlTag.yaml_reference,
                    );

                    if (
                        projectYamlTag &&
                        (projectYamlTag.name !== yamlTag.name ||
                            projectYamlTag.color !== yamlTag.color)
                    ) {
                        acc[projectYamlTag.tag_uuid] = {
                            color: yamlTag.color,
                            name: yamlTag.name,
                        };
                    }

                    return acc;
                },
                {},
            );

            result.yamlTagsToCreateOrUpdate = [
                ...result.yamlTagsToCreateOrUpdate,
                ...Object.values(yamlTagUpdates).map((tag) => tag.name ?? ''),
            ];

            // delete all yaml tags that are in the project but are not in the yamlTags array
            await trx(TagsTableName)
                .whereNotNull('yaml_reference')
                .whereNotIn(
                    'yaml_reference',
                    yamlTags.map((t) => t.yaml_reference),
                )
                .where('project_uuid', projectUuid)
                .delete();

            if (yamlTagsToCreate.length > 0) {
                // create all yaml tags that are not in the project but are in the yamlTags array
                await trx(TagsTableName).insert(yamlTagsToCreate);
            }

            if (Object.keys(yamlTagUpdates).length > 0) {
                // apply all updates to the existing project yaml tags
                const updatePromises = Object.entries(yamlTagUpdates).map(
                    ([tagUuid, tagUpdate]) =>
                        trx(TagsTableName)
                            .where('tag_uuid', tagUuid)
                            .update(tagUpdate),
                );

                await Promise.all(updatePromises);
            }
        });

        return result;
    }
}
