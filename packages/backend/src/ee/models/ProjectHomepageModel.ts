import {
    NotFoundError,
    type HomepageConfig,
    type ProjectHomepage,
    type PublishedProjectHomepage,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    HomepagesTableName,
    type DbProjectHomepage,
} from '../database/entities/projectHomepages';

export class ProjectHomepageModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private static mapDbHomepage(row: DbProjectHomepage): ProjectHomepage {
        return {
            homepageUuid: row.homepage_uuid,
            projectUuid: row.project_uuid,
            name: row.name,
            draftConfig: row.draft_config,
            publishedConfig: row.published_config,
            isDefault: row.is_default,
            createdByUserUuid: row.created_by_user_uuid,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async getDefault(
        projectUuid: string,
    ): Promise<ProjectHomepage | undefined> {
        const row = await this.database(HomepagesTableName)
            .where({ project_uuid: projectUuid, is_default: true })
            .first();
        return row ? ProjectHomepageModel.mapDbHomepage(row) : undefined;
    }

    async getPublishedDefault(
        projectUuid: string,
    ): Promise<PublishedProjectHomepage | undefined> {
        const row = await this.database(HomepagesTableName)
            .where({ project_uuid: projectUuid, is_default: true })
            .whereNotNull('published_config')
            .first();
        if (!row || row.published_config === null) return undefined;
        return {
            homepageUuid: row.homepage_uuid,
            name: row.name,
            config: row.published_config,
        };
    }

    async create(data: {
        projectUuid: string;
        name: string;
        draftConfig: HomepageConfig;
        createdByUserUuid: string;
    }): Promise<ProjectHomepage> {
        const [row] = await this.database(HomepagesTableName)
            .insert({
                project_uuid: data.projectUuid,
                name: data.name,
                draft_config: data.draftConfig,
                is_default: true,
                created_by_user_uuid: data.createdByUserUuid,
            })
            .returning('*');
        return ProjectHomepageModel.mapDbHomepage(row);
    }

    async updateDraft(
        homepageUuid: string,
        update: { name?: string; draftConfig: HomepageConfig },
    ): Promise<ProjectHomepage> {
        const [row] = await this.database(HomepagesTableName)
            .where({ homepage_uuid: homepageUuid })
            .update({
                ...(update.name !== undefined ? { name: update.name } : {}),
                draft_config: update.draftConfig,
                updated_at: new Date(),
            })
            .returning('*');
        if (!row) {
            throw new NotFoundError('Homepage not found');
        }
        return ProjectHomepageModel.mapDbHomepage(row);
    }

    async publish(homepageUuid: string): Promise<ProjectHomepage> {
        return this.database.transaction(async (trx) => {
            const existing = await trx(HomepagesTableName)
                .where({ homepage_uuid: homepageUuid })
                .first();
            if (!existing) {
                throw new NotFoundError('Homepage not found');
            }
            const [row] = await trx(HomepagesTableName)
                .where({ homepage_uuid: homepageUuid })
                .update({
                    published_config: existing.draft_config,
                    updated_at: new Date(),
                })
                .returning('*');
            return ProjectHomepageModel.mapDbHomepage(row);
        });
    }
}
