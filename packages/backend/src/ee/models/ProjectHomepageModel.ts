import {
    ConflictError,
    NotFoundError,
    ParameterError,
    type AnnouncementCategory,
    type AnnouncementsPage,
    type HomepageAssignment,
    type HomepageAudience,
    type HomepageConfig,
    type HomepageRecentlyViewedItem,
    type ProjectAnnouncement,
    type ProjectHomepage,
    type ProjectMemberRole,
    type PublishedProjectHomepage,
    type ResolvedPublishedHomepage,
    type UpdateAnnouncementRequest,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AnnouncementCategoriesTableName,
    AnnouncementsTableName,
    HomepageAssignmentsTableName,
    HomepagePersonalOverridesTableName,
    HomepagesTableName,
    type DbAnnouncement,
    type DbAnnouncementCategory,
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
            allowPersonal: row.allow_personal,
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
            allowPersonal: row.allow_personal,
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

    async discardDraft(homepageUuid: string): Promise<ProjectHomepage> {
        const existing = await this.database(HomepagesTableName)
            .where({ homepage_uuid: homepageUuid })
            .first();
        if (!existing) {
            throw new NotFoundError('Homepage not found');
        }
        if (existing.published_config === null) {
            throw new ParameterError(
                'This homepage has never been published, so there is no version to revert to',
            );
        }
        const [row] = await this.database(HomepagesTableName)
            .where({ homepage_uuid: homepageUuid })
            .update({
                draft_config: existing.published_config,
                updated_at: new Date(),
            })
            .returning('*');
        return ProjectHomepageModel.mapDbHomepage(row);
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
                  AND sq.deleted_at IS NULL
                  AND s.deleted_at IS NULL
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
                  AND d.deleted_at IS NULL
                  AND s.deleted_at IS NULL
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

    async getPersonalOverride(
        userUuid: string,
        projectUuid: string,
    ): Promise<string | undefined> {
        const row = await this.database(HomepagePersonalOverridesTableName)
            .join(
                'dashboards',
                'dashboards.dashboard_uuid',
                `${HomepagePersonalOverridesTableName}.dashboard_uuid`,
            )
            .where(`${HomepagePersonalOverridesTableName}.user_uuid`, userUuid)
            .andWhere(
                `${HomepagePersonalOverridesTableName}.project_uuid`,
                projectUuid,
            )
            .whereNull('dashboards.deleted_at')
            .select(`${HomepagePersonalOverridesTableName}.dashboard_uuid`)
            .first();
        return row?.dashboard_uuid;
    }

    async setPersonalOverride(
        userUuid: string,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<void> {
        const dashboardInProject = await this.database('dashboards')
            .join('spaces', 'spaces.space_id', 'dashboards.space_id')
            .join('projects', 'projects.project_id', 'spaces.project_id')
            .where('dashboards.dashboard_uuid', dashboardUuid)
            .where('projects.project_uuid', projectUuid)
            .whereNull('dashboards.deleted_at')
            .first();
        if (!dashboardInProject) {
            throw new NotFoundError('Dashboard not found in this project');
        }
        await this.database(HomepagePersonalOverridesTableName)
            .insert({
                user_uuid: userUuid,
                project_uuid: projectUuid,
                dashboard_uuid: dashboardUuid,
            })
            .onConflict(['user_uuid', 'project_uuid'])
            .merge({ dashboard_uuid: dashboardUuid });
    }

    async deletePersonalOverride(
        userUuid: string,
        projectUuid: string,
    ): Promise<void> {
        await this.database(HomepagePersonalOverridesTableName)
            .where({ user_uuid: userUuid, project_uuid: projectUuid })
            .delete();
    }

    // Publishing to "everyone" promotes the homepage to the project default
    async publish(
        homepageUuid: string,
        audience: HomepageAudience,
        allowPersonal: boolean,
    ): Promise<ProjectHomepage> {
        return this.database.transaction(async (trx) => {
            const existing = await trx(HomepagesTableName)
                .where({ homepage_uuid: homepageUuid })
                .first();
            if (!existing) {
                throw new NotFoundError('Homepage not found');
            }
            const makeDefault = audience.type === 'everyone';
            if (makeDefault) {
                await trx(HomepagesTableName)
                    .where({
                        project_uuid: existing.project_uuid,
                        is_default: true,
                    })
                    .whereNot({ homepage_uuid: homepageUuid })
                    .update({ is_default: false });
            }
            const [row] = await trx(HomepagesTableName)
                .where({ homepage_uuid: homepageUuid })
                .update({
                    published_config: existing.draft_config,
                    allow_personal: allowPersonal,
                    ...(makeDefault ? { is_default: true } : {}),
                    updated_at: new Date(),
                })
                .returning('*');

            if (audience.type === 'groups') {
                // Reassigning a group moves it off its previous homepage
                await trx(HomepageAssignmentsTableName)
                    .where({
                        project_uuid: existing.project_uuid,
                        target_type: 'group',
                    })
                    .where((builder) =>
                        builder
                            .whereIn('group_uuid', audience.groupUuids)
                            .orWhere({ homepage_uuid: homepageUuid }),
                    )
                    .delete();
                const maxPriorityRow = await trx(HomepageAssignmentsTableName)
                    .where({
                        project_uuid: existing.project_uuid,
                        target_type: 'group',
                    })
                    .max<{ max: number | null }>('priority as max')
                    .first();
                const basePriority = (maxPriorityRow?.max ?? -1) + 1;
                if (audience.groupUuids.length > 0) {
                    await trx(HomepageAssignmentsTableName).insert(
                        audience.groupUuids.map((groupUuid, index) => ({
                            project_uuid: existing.project_uuid,
                            homepage_uuid: homepageUuid,
                            target_type: 'group' as const,
                            group_uuid: groupUuid,
                            role: null,
                            priority: basePriority + index,
                        })),
                    );
                }
            } else if (audience.type === 'roles') {
                await trx(HomepageAssignmentsTableName)
                    .where({
                        project_uuid: existing.project_uuid,
                        target_type: 'role',
                    })
                    .where((builder) =>
                        builder
                            .whereIn('role', audience.roles)
                            .orWhere({ homepage_uuid: homepageUuid }),
                    )
                    .delete();
                if (audience.roles.length > 0) {
                    await trx(HomepageAssignmentsTableName).insert(
                        audience.roles.map((role) => ({
                            project_uuid: existing.project_uuid,
                            homepage_uuid: homepageUuid,
                            target_type: 'role' as const,
                            group_uuid: null,
                            role,
                            priority: 0,
                        })),
                    );
                }
            }
            return ProjectHomepageModel.mapDbHomepage(row);
        });
    }

    async getAssignments(projectUuid: string): Promise<HomepageAssignment[]> {
        const rows = await this.database(HomepageAssignmentsTableName)
            .leftJoin(
                HomepagesTableName,
                `${HomepagesTableName}.homepage_uuid`,
                `${HomepageAssignmentsTableName}.homepage_uuid`,
            )
            .leftJoin(
                'groups',
                'groups.group_uuid',
                `${HomepageAssignmentsTableName}.group_uuid`,
            )
            .where(`${HomepageAssignmentsTableName}.project_uuid`, projectUuid)
            .orderBy(`${HomepageAssignmentsTableName}.priority`, 'asc')
            .select(
                `${HomepageAssignmentsTableName}.assignment_uuid`,
                `${HomepageAssignmentsTableName}.homepage_uuid`,
                `${HomepagesTableName}.name as homepage_name`,
                `${HomepageAssignmentsTableName}.target_type`,
                `${HomepageAssignmentsTableName}.group_uuid`,
                'groups.name as group_name',
                `${HomepageAssignmentsTableName}.role`,
                `${HomepageAssignmentsTableName}.priority`,
            );
        return rows.map((row) => ({
            assignmentUuid: row.assignment_uuid,
            homepageUuid: row.homepage_uuid,
            homepageName: row.homepage_name,
            targetType: row.target_type,
            groupUuid: row.group_uuid,
            groupName: row.group_name ?? null,
            role: row.role,
            priority: row.priority,
        }));
    }

    async updateGroupPriorities(
        projectUuid: string,
        groupUuids: string[],
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await Promise.all(
                groupUuids.map((groupUuid, index) =>
                    trx(HomepageAssignmentsTableName)
                        .where({
                            project_uuid: projectUuid,
                            target_type: 'group',
                            group_uuid: groupUuid,
                        })
                        .update({ priority: index }),
                ),
            );
        });
    }

    // Resolution: group (by admin-ranked priority) → role → project default
    async resolvePublished(
        projectUuid: string,
        viewer: { groupUuids: string[]; role: ProjectMemberRole | undefined },
    ): Promise<ResolvedPublishedHomepage | undefined> {
        const publishedAssigned = async (
            builderFilter: (builder: Knex.QueryBuilder) => void,
        ) => {
            const query = this.database(HomepageAssignmentsTableName)
                .join(
                    HomepagesTableName,
                    `${HomepagesTableName}.homepage_uuid`,
                    `${HomepageAssignmentsTableName}.homepage_uuid`,
                )
                .where(
                    `${HomepageAssignmentsTableName}.project_uuid`,
                    projectUuid,
                )
                .whereNotNull(`${HomepagesTableName}.published_config`)
                .orderBy(`${HomepageAssignmentsTableName}.priority`, 'asc')
                .select(
                    `${HomepagesTableName}.*`,
                    `${HomepageAssignmentsTableName}.group_uuid as assignment_group_uuid`,
                    `${HomepageAssignmentsTableName}.priority as assignment_priority`,
                )
                .first();
            builderFilter(query);
            return query;
        };

        if (viewer.groupUuids.length > 0) {
            const byGroup = await publishedAssigned((builder) => {
                void builder
                    .where('target_type', 'group')
                    .whereIn('group_uuid', viewer.groupUuids);
            });
            if (byGroup && byGroup.published_config) {
                return {
                    homepage: {
                        homepageUuid: byGroup.homepage_uuid,
                        name: byGroup.name,
                        config: byGroup.published_config,
                        allowPersonal: byGroup.allow_personal,
                    },
                    source: {
                        type: 'group',
                        groupUuid: byGroup.assignment_group_uuid,
                        priority: byGroup.assignment_priority,
                    },
                };
            }
        }
        if (viewer.role) {
            const byRole = await publishedAssigned((builder) => {
                void builder
                    .where('target_type', 'role')
                    .where('role', viewer.role);
            });
            if (byRole && byRole.published_config) {
                return {
                    homepage: {
                        homepageUuid: byRole.homepage_uuid,
                        name: byRole.name,
                        config: byRole.published_config,
                        allowPersonal: byRole.allow_personal,
                    },
                    source: { type: 'role', role: viewer.role },
                };
            }
        }
        const publishedDefault = await this.getPublishedDefault(projectUuid);
        return publishedDefault
            ? { homepage: publishedDefault, source: { type: 'default' } }
            : undefined;
    }

    // --- Announcements -----------------------------------------------------

    private static mapDbAnnouncement(
        row: DbAnnouncement & { author_name?: string | null },
    ): ProjectAnnouncement {
        return {
            announcementUuid: row.announcement_uuid,
            projectUuid: row.project_uuid,
            title: row.title,
            body: row.body,
            categoryUuid: row.category_uuid,
            pinned: row.pinned,
            createdByUserUuid: row.created_by_user_uuid,
            authorName: row.author_name?.trim() || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private announcementsQuery(projectUuid: string, categoryUuid?: string) {
        const query = this.database(AnnouncementsTableName)
            .where(`${AnnouncementsTableName}.project_uuid`, projectUuid)
            .orderBy([
                { column: 'pinned', order: 'desc' },
                {
                    column: `${AnnouncementsTableName}.created_at`,
                    order: 'desc',
                },
            ]);
        if (categoryUuid) {
            // Knex builders are thenables; void marks the in-place mutation
            // as intentionally not awaited.
            void query.where(
                `${AnnouncementsTableName}.category_uuid`,
                categoryUuid,
            );
        }
        return query;
    }

    async listAnnouncements(
        projectUuid: string,
        options: { page: number; pageSize: number; categoryUuid?: string },
    ): Promise<AnnouncementsPage> {
        const offset = (options.page - 1) * options.pageSize;
        const [rows, countRow] = await Promise.all([
            this.announcementsQuery(projectUuid, options.categoryUuid)
                .leftJoin(
                    'users',
                    'users.user_uuid',
                    `${AnnouncementsTableName}.created_by_user_uuid`,
                )
                .select(
                    `${AnnouncementsTableName}.*`,
                    this.database.raw(
                        `TRIM(CONCAT(users.first_name, ' ', users.last_name)) as author_name`,
                    ),
                )
                .offset(offset)
                .limit(options.pageSize),
            this.database(AnnouncementsTableName)
                .where('project_uuid', projectUuid)
                .modify((builder) => {
                    if (options.categoryUuid) {
                        void builder.where(
                            'category_uuid',
                            options.categoryUuid,
                        );
                    }
                })
                .count<{ count: string }>('* as count')
                .first(),
        ]);
        return {
            items: rows.map(ProjectHomepageModel.mapDbAnnouncement),
            totalCount: Number(countRow?.count ?? 0),
        };
    }

    async getAnnouncement(
        announcementUuid: string,
    ): Promise<ProjectAnnouncement | undefined> {
        const row = await this.database(AnnouncementsTableName)
            .where({ announcement_uuid: announcementUuid })
            .first();
        return row ? ProjectHomepageModel.mapDbAnnouncement(row) : undefined;
    }

    async createAnnouncement(data: {
        projectUuid: string;
        title: string;
        body: string | null;
        categoryUuid: string | null;
        createdByUserUuid: string;
    }): Promise<ProjectAnnouncement> {
        const [row] = await this.database(AnnouncementsTableName)
            .insert({
                project_uuid: data.projectUuid,
                title: data.title,
                body: data.body,
                category_uuid: data.categoryUuid,
                created_by_user_uuid: data.createdByUserUuid,
            })
            .returning('*');
        return ProjectHomepageModel.mapDbAnnouncement(row);
    }

    async updateAnnouncement(
        announcementUuid: string,
        update: UpdateAnnouncementRequest,
    ): Promise<ProjectAnnouncement> {
        return this.database.transaction(async (trx) => {
            const existing = await trx(AnnouncementsTableName)
                .where({ announcement_uuid: announcementUuid })
                .first();
            if (!existing) throw new NotFoundError('Announcement not found');
            // Single lead story: pinning unpins the previous lead first.
            if (update.pinned === true) {
                await trx(AnnouncementsTableName)
                    .where({
                        project_uuid: existing.project_uuid,
                        pinned: true,
                    })
                    .update({ pinned: false });
            }
            const [row] = await trx(AnnouncementsTableName)
                .where({ announcement_uuid: announcementUuid })
                .update({
                    ...(update.title !== undefined && { title: update.title }),
                    ...(update.body !== undefined && { body: update.body }),
                    ...(update.categoryUuid !== undefined && {
                        category_uuid: update.categoryUuid,
                    }),
                    ...(update.pinned !== undefined && {
                        pinned: update.pinned,
                    }),
                    updated_at: new Date(),
                })
                .returning('*');
            return ProjectHomepageModel.mapDbAnnouncement(row);
        });
    }

    async deleteAnnouncement(announcementUuid: string): Promise<void> {
        const deleted = await this.database(AnnouncementsTableName)
            .where({ announcement_uuid: announcementUuid })
            .delete();
        if (deleted === 0) throw new NotFoundError('Announcement not found');
    }

    private static readonly STARTER_CATEGORIES: Array<
        Pick<AnnouncementCategory, 'name' | 'color'>
    > = [
        { name: 'Release', color: '#3b5bdb' },
        { name: 'Incident', color: '#c92a2a' },
        { name: 'Data change', color: '#2b8a3e' },
    ];

    private static mapDbCategory(
        row: DbAnnouncementCategory,
    ): AnnouncementCategory {
        return {
            categoryUuid: row.category_uuid,
            projectUuid: row.project_uuid,
            name: row.name,
            color: row.color,
        };
    }

    async listCategories(projectUuid: string): Promise<AnnouncementCategory[]> {
        const existing = await this.database(AnnouncementCategoriesTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'asc');
        if (existing.length > 0) {
            return existing.map(ProjectHomepageModel.mapDbCategory);
        }
        // Lazy starter set; tolerate a concurrent seeder via onConflict.
        await this.database(AnnouncementCategoriesTableName)
            .insert(
                ProjectHomepageModel.STARTER_CATEGORIES.map((category) => ({
                    project_uuid: projectUuid,
                    name: category.name,
                    color: category.color,
                })),
            )
            .onConflict(['project_uuid', 'name'])
            .ignore();
        const seeded = await this.database(AnnouncementCategoriesTableName)
            .where({ project_uuid: projectUuid })
            .orderBy('created_at', 'asc');
        return seeded.map(ProjectHomepageModel.mapDbCategory);
    }

    async getCategory(
        categoryUuid: string,
    ): Promise<AnnouncementCategory | undefined> {
        const row = await this.database(AnnouncementCategoriesTableName)
            .where({ category_uuid: categoryUuid })
            .first();
        return row ? ProjectHomepageModel.mapDbCategory(row) : undefined;
    }

    async createCategory(data: {
        projectUuid: string;
        name: string;
        color: string;
    }): Promise<AnnouncementCategory> {
        try {
            const [row] = await this.database(AnnouncementCategoriesTableName)
                .insert({
                    project_uuid: data.projectUuid,
                    name: data.name,
                    color: data.color,
                })
                .returning('*');
            return ProjectHomepageModel.mapDbCategory(row);
        } catch (error) {
            if (
                error instanceof Error &&
                'code' in error &&
                error.code === '23505'
            ) {
                throw new ConflictError(
                    'A category with this name already exists',
                );
            }
            throw error;
        }
    }
}
