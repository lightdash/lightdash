import {
    AnnouncementCategory,
    ConflictError,
    HOMEPAGE_DEFAULT_GREETING_SUBTITLE,
    NotFoundError,
    ParameterError,
    sanitizeHomepageConfig,
    type AnnouncementsPage,
    type HomepageAssignment,
    type HomepageAudience,
    type HomepageBlock,
    type HomepageConfig,
    type HomepageOpening,
    type HomepageRecentlyViewedItem,
    type OrganizationHomepageSettings,
    type ProjectAnnouncement,
    type ProjectHomepage,
    type ProjectMemberRole,
    type PublishedProjectHomepage,
    type ResolvedPublishedHomepage,
    type UpdateAnnouncementRequest,
    type UpdateOrganizationHomepageSettings,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { OrganizationHomepageSettingsTableName } from '../database/entities/organizationHomepageSettings';
import {
    AnnouncementsTableName,
    HomepageAssignmentsTableName,
    HomepagesTableName,
    type DbAnnouncement,
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
            // Stored configs are raw jsonb: migrate legacy shapes and drop
            // blocks that no longer validate, so every consumer gets a
            // guaranteed HomepageConfig rather than a cast.
            draftConfig: sanitizeHomepageConfig(row.draft_config),
            publishedConfig:
                row.published_config === null
                    ? null
                    : sanitizeHomepageConfig(row.published_config),
            isDefault: row.is_default,
            createdByUserUuid: row.created_by_user_uuid,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async findOrgHomepageSettings(
        organizationUuid: string,
    ): Promise<OrganizationHomepageSettings | null> {
        const row = await this.database(OrganizationHomepageSettingsTableName)
            .where('organization_uuid', organizationUuid)
            .first();
        if (!row) return null;
        return {
            organizationUuid: row.organization_uuid,
            enabled: row.enabled,
            opening: row.opening,
        };
    }

    async upsertOrgHomepageSettings(
        organizationUuid: string,
        update: UpdateOrganizationHomepageSettings,
    ): Promise<OrganizationHomepageSettings> {
        const [row] = await this.database(OrganizationHomepageSettingsTableName)
            .insert({
                organization_uuid: organizationUuid,
                enabled: update.enabled,
                opening: update.opening,
            })
            .onConflict('organization_uuid')
            .merge({
                enabled: update.enabled,
                opening: update.opening,
                updated_at: new Date(),
            })
            .returning('*');
        return {
            organizationUuid: row.organization_uuid,
            enabled: row.enabled,
            opening: row.opening,
        };
    }

    /**
     * Rewrites stored hero blocks across every homepage in the organization
     * (drafts and published) to match the opening the admin just chose:
     * content-first turns ask heroes into greetings, ask-first turns greetings
     * into ask heroes. Block ids and density survive; a page-level exception
     * is one swap away in the builder.
     */
    async swapHeroBlocks(
        organizationUuid: string,
        opening: HomepageOpening,
    ): Promise<void> {
        const rows: DbProjectHomepage[] = await this.database(
            HomepagesTableName,
        )
            .join(
                'projects',
                'projects.project_uuid',
                `${HomepagesTableName}.project_uuid`,
            )
            .join(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('organizations.organization_uuid', organizationUuid)
            .select<DbProjectHomepage[]>(`${HomepagesTableName}.*`);

        const sourceType =
            opening === 'content-first' ? 'ask-ai-hero' : 'greeting';
        const swapBlock = (block: HomepageBlock): HomepageBlock => {
            if (opening === 'content-first' && block.type === 'ask-ai-hero') {
                return {
                    id: block.id,
                    type: 'greeting',
                    config: {
                        subtitle: HOMEPAGE_DEFAULT_GREETING_SUBTITLE,
                        density: block.config.density,
                    },
                };
            }
            if (opening === 'ask-first' && block.type === 'greeting') {
                return {
                    id: block.id,
                    type: 'ask-ai-hero',
                    config: {
                        showGreeting: true,
                        density: block.config.density,
                    },
                };
            }
            return block;
        };

        const swapConfig = (config: HomepageConfig): HomepageConfig => ({
            ...config,
            rows: config.rows.map((row) => ({
                ...row,
                blocks: row.blocks.map(swapBlock),
            })),
        });

        const hasSourceHero = (config: HomepageConfig | null): boolean =>
            config?.rows.some((row) =>
                row.blocks.some((block) => block.type === sourceType),
            ) ?? false;

        const affected = rows.filter(
            (row) =>
                hasSourceHero(row.draft_config) ||
                hasSourceHero(row.published_config),
        );
        await Promise.all(
            affected.map((row) =>
                this.database(HomepagesTableName)
                    .where('homepage_uuid', row.homepage_uuid)
                    .update({
                        draft_config: swapConfig(row.draft_config),
                        published_config:
                            row.published_config === null
                                ? null
                                : swapConfig(row.published_config),
                        updated_at: new Date(),
                    }),
            ),
        );
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
            config: sanitizeHomepageConfig(row.published_config),
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
            -- Read the viewer's own history first, off the
            -- (user_uuid, timestamp) indexes, and only then filter by project.
            -- Joining the content tables up front makes Postgres drive from
            -- saved_queries and re-scan every chart's whole view history.
            WITH raw_views AS MATERIALIZED (
                SELECT 'chart' AS content_type,
                       acv.chart_uuid AS content_uuid,
                       acv.timestamp AS viewed_at
                FROM analytics_chart_views acv
                WHERE acv.user_uuid = :userUuid
                  -- Opening a dashboard records a view for every tile on it,
                  -- which would bury the dashboard the user actually opened.
                  -- Tiles are tagged where we can, but several code paths
                  -- write untagged rows, so also drop chart views that land
                  -- in the moments around one of this user's dashboard views.
                  AND (acv.context ->> 'source') IS DISTINCT FROM 'dashboard'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM analytics_dashboard_views tile_dv
                      WHERE tile_dv.user_uuid = acv.user_uuid
                        -- Keep tile_dv.timestamp on the left: this is the same
                        -- window as acv BETWEEN tile_dv - 2s AND tile_dv + 15s,
                        -- but only this orientation is an indexable range.
                        -- The other way round Postgres builds the full
                        -- chart-views x dashboard-views cross product.
                        AND tile_dv.timestamp BETWEEN acv.timestamp - interval '15 seconds'
                                                  AND acv.timestamp + interval '2 seconds'
                  )
                UNION ALL
                SELECT 'dashboard' AS content_type,
                       adv.dashboard_uuid AS content_uuid,
                       adv.timestamp AS viewed_at
                FROM analytics_dashboard_views adv
                WHERE adv.user_uuid = :userUuid
            ),
            recent AS MATERIALIZED (
                SELECT content_type, content_uuid, max(viewed_at) AS viewed_at
                FROM raw_views
                GROUP BY content_type, content_uuid
            )
            SELECT r.content_type, r.content_uuid, r.viewed_at
            FROM recent r
            WHERE (
                    r.content_type = 'chart'
                    AND EXISTS (
                        SELECT 1
                        FROM saved_queries sq
                        JOIN spaces s ON s.space_id = sq.space_id
                        JOIN projects p ON p.project_id = s.project_id
                        WHERE sq.saved_query_uuid = r.content_uuid
                          AND p.project_uuid = :projectUuid
                          AND sq.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                    )
                  )
               OR (
                    r.content_type = 'dashboard'
                    AND EXISTS (
                        SELECT 1
                        FROM dashboards d
                        JOIN spaces s ON s.space_id = d.space_id
                        JOIN projects p ON p.project_id = s.project_id
                        WHERE d.dashboard_uuid = r.content_uuid
                          AND p.project_uuid = :projectUuid
                          AND d.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                    )
                  )
            ORDER BY r.viewed_at DESC
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

    // Publishing to "everyone" promotes the homepage to the project default
    async publish(
        homepageUuid: string,
        audience: HomepageAudience,
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
                        config: sanitizeHomepageConfig(
                            byGroup.published_config,
                        ),
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
                        config: sanitizeHomepageConfig(byRole.published_config),
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
            category: (row.category as AnnouncementCategory | null) ?? null,
            pinned: row.pinned,
            published:
                row.published_at !== null && row.published_at !== undefined,
            pendingSlackChannelId: row.pending_slack_channel_id ?? null,
            createdByUserUuid: row.created_by_user_uuid,
            authorName: row.author_name?.trim() || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private announcementsQuery(projectUuid: string) {
        return this.database(AnnouncementsTableName)
            .where(`${AnnouncementsTableName}.project_uuid`, projectUuid)
            .orderBy([
                { column: 'pinned', order: 'desc' },
                {
                    column: `${AnnouncementsTableName}.created_at`,
                    order: 'desc',
                },
            ]);
    }

    async listAnnouncements(
        projectUuid: string,
        options: {
            page: number;
            pageSize: number;
            includeUnpublished?: boolean;
        },
    ): Promise<AnnouncementsPage> {
        const offset = (options.page - 1) * options.pageSize;
        const itemsQuery = this.announcementsQuery(projectUuid)
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
            .limit(options.pageSize);
        const countQuery = this.database(AnnouncementsTableName)
            .where('project_uuid', projectUuid)
            .count<{ count: string }>('* as count')
            .first();
        if (!options.includeUnpublished) {
            void itemsQuery.whereNotNull(
                `${AnnouncementsTableName}.published_at`,
            );
            void countQuery.whereNotNull('published_at');
        }
        const [rows, countRow] = await Promise.all([itemsQuery, countQuery]);
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
        category: AnnouncementCategory | null;
        createdByUserUuid: string;
        pendingSlackChannelId: string | null;
    }): Promise<ProjectAnnouncement> {
        const [row] = await this.database(AnnouncementsTableName)
            .insert({
                project_uuid: data.projectUuid,
                title: data.title,
                body: data.body,
                category: data.category,
                created_by_user_uuid: data.createdByUserUuid,
                published_at: null,
                pending_slack_channel_id: data.pendingSlackChannelId,
            })
            .returning('*');
        return ProjectHomepageModel.mapDbAnnouncement(row);
    }

    /**
     * Publishes all of a project's draft announcements (called when the
     * homepage itself is published) and returns the ones with a pending
     * Slack notification so the caller can fire it.
     */
    async publishProjectDraftAnnouncements(
        projectUuid: string,
    ): Promise<
        Array<{ announcement: ProjectAnnouncement; slackChannelId: string }>
    > {
        return this.database.transaction(async (trx) => {
            // Lock the drafts (skipping any a concurrent publisher already
            // holds) so the same draft can't be published — and Slack-notified
            // — twice.
            const drafts = await trx(AnnouncementsTableName)
                .where({ project_uuid: projectUuid })
                .whereNull('published_at')
                .forUpdate()
                .skipLocked()
                .select('announcement_uuid', 'pending_slack_channel_id');
            if (drafts.length === 0) return [];

            const announcementUuids = drafts.map(
                (draft) => draft.announcement_uuid,
            );
            const rows = await trx(AnnouncementsTableName)
                .whereIn('announcement_uuid', announcementUuids)
                .whereNull('published_at')
                .update({
                    published_at: new Date(),
                    pending_slack_channel_id: null,
                })
                .returning('*');

            const pendingSlackChannelByUuid = new Map(
                drafts.map((draft) => [
                    draft.announcement_uuid,
                    draft.pending_slack_channel_id,
                ]),
            );
            return rows.reduce<
                Array<{
                    announcement: ProjectAnnouncement;
                    slackChannelId: string;
                }>
            >((acc, row) => {
                const slackChannelId = pendingSlackChannelByUuid.get(
                    row.announcement_uuid,
                );
                if (slackChannelId) {
                    acc.push({
                        announcement:
                            ProjectHomepageModel.mapDbAnnouncement(row),
                        slackChannelId,
                    });
                }
                return acc;
            }, []);
        });
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
                    .update({ pinned: false, updated_at: new Date() });
            }
            const [row] = await trx(AnnouncementsTableName)
                .where({ announcement_uuid: announcementUuid })
                .update({
                    ...(update.title !== undefined && { title: update.title }),
                    ...(update.body !== undefined && { body: update.body }),
                    ...(update.category !== undefined && {
                        category: update.category,
                    }),
                    ...(update.pinned !== undefined && {
                        pinned: update.pinned,
                    }),
                    ...(update.slackChannelId !== undefined && {
                        pending_slack_channel_id: update.slackChannelId,
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
}
