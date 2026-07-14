import {
    ConflictError,
    NotFoundError,
    type HomepageConfig,
    type HomepageRecentlyViewedItem,
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

    async getByUuid(
        homepageUuid: string,
    ): Promise<ProjectHomepage | undefined> {
        const row = await this.database(HomepagesTableName)
            .where({ homepage_uuid: homepageUuid })
            .first();
        return row ? ProjectHomepageModel.mapDbHomepage(row) : undefined;
    }

    async list(projectUuid: string): Promise<ProjectHomepage[]> {
        const rows = await this.database(HomepagesTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'asc');
        return rows.map(ProjectHomepageModel.mapDbHomepage);
    }

    async delete(homepageUuid: string): Promise<void> {
        const deletedCount = await this.database(HomepagesTableName)
            .where({ homepage_uuid: homepageUuid })
            .delete();
        if (deletedCount === 0) {
            throw new NotFoundError('Homepage not found');
        }
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
        return this.database.transaction(async (trx) => {
            const existingDefault = await trx(HomepagesTableName)
                .where({ project_uuid: data.projectUuid, is_default: true })
                .first();
            const [row] = await trx(HomepagesTableName)
                .insert({
                    project_uuid: data.projectUuid,
                    name: data.name,
                    draft_config: data.draftConfig,
                    is_default: existingDefault === undefined,
                    created_by_user_uuid: data.createdByUserUuid,
                })
                .returning('*');
            return ProjectHomepageModel.mapDbHomepage(row);
        });
    }

    async updateDraft(
        homepageUuid: string,
        update: {
            name?: string;
            draftConfig: HomepageConfig;
            baseUpdatedAt: Date;
        },
    ): Promise<ProjectHomepage> {
        const [row] = await this.database(HomepagesTableName)
            .where({ homepage_uuid: homepageUuid })
            // JS dates are ms-precision; Postgres stores µs — compare at ms
            .whereRaw(
                "date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ?::timestamp)",
                [update.baseUpdatedAt],
            )
            .update({
                ...(update.name !== undefined ? { name: update.name } : {}),
                draft_config: update.draftConfig,
                updated_at: new Date(),
            })
            .returning('*');
        if (!row) {
            const exists = await this.database(HomepagesTableName)
                .where({ homepage_uuid: homepageUuid })
                .first();
            if (exists) {
                throw new ConflictError(
                    'This homepage was changed somewhere else',
                );
            }
            throw new NotFoundError('Homepage not found');
        }
        return ProjectHomepageModel.mapDbHomepage(row);
    }

    // Derived from the existing analytics view events — no separate tracking
    async getRecentlyViewed(
        projectUuid: string,
        userUuid: string,
        limit: number = 8,
    ): Promise<HomepageRecentlyViewedItem[]> {
        const { rows } = await this.database.raw<{
            rows: Array<{
                content_type: 'chart' | 'dashboard';
                content_uuid: string;
                viewed_at: Date;
            }>;
        }>(
            `
            SELECT content_type, content_uuid, max(viewed_at) AS viewed_at
            FROM (
                SELECT 'chart' AS content_type,
                       acv.chart_uuid AS content_uuid,
                       acv.timestamp AS viewed_at
                FROM analytics_chart_views acv
                JOIN saved_queries sq ON sq.saved_query_uuid = acv.chart_uuid
                JOIN spaces s ON s.space_id = sq.space_id
                JOIN projects p ON p.project_id = s.project_id
                WHERE acv.user_uuid = :userUuid
                  AND p.project_uuid = :projectUuid
                UNION ALL
                SELECT 'dashboard' AS content_type,
                       adv.dashboard_uuid AS content_uuid,
                       adv.timestamp AS viewed_at
                FROM analytics_dashboard_views adv
                JOIN dashboards d ON d.dashboard_uuid = adv.dashboard_uuid
                JOIN spaces s ON s.space_id = d.space_id
                JOIN projects p ON p.project_id = s.project_id
                WHERE adv.user_uuid = :userUuid
                  AND p.project_uuid = :projectUuid
            ) views
            GROUP BY content_type, content_uuid
            ORDER BY viewed_at DESC
            LIMIT :limit
            `,
            { userUuid, projectUuid, limit },
        );
        return rows.map((row) => ({
            contentType: row.content_type,
            uuid: row.content_uuid,
            viewedAt: row.viewed_at,
        }));
    }

    // Publishing promotes the homepage to the project default viewers land on
    async publish(homepageUuid: string): Promise<ProjectHomepage> {
        return this.database.transaction(async (trx) => {
            const existing = await trx(HomepagesTableName)
                .where({ homepage_uuid: homepageUuid })
                .first();
            if (!existing) {
                throw new NotFoundError('Homepage not found');
            }
            await trx(HomepagesTableName)
                .where({
                    project_uuid: existing.project_uuid,
                    is_default: true,
                })
                .whereNot({ homepage_uuid: homepageUuid })
                .update({ is_default: false });
            const [row] = await trx(HomepagesTableName)
                .where({ homepage_uuid: homepageUuid })
                .update({
                    published_config: existing.draft_config,
                    is_default: true,
                    updated_at: new Date(),
                })
                .returning('*');
            return ProjectHomepageModel.mapDbHomepage(row);
        });
    }
}
