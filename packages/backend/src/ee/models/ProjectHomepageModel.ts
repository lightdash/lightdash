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
import { UserTableName } from '../../database/entities/users';
import { isStatementTimeout } from '../../database/errors';
import Logger from '../../logging/logger';
import { OrganizationHomepageSettingsTableName } from '../database/entities/organizationHomepageSettings';
import {
    AnnouncementsTableName,
    HomepageAssignmentsTableName,
    HomepagesTableName,
    type DbAnnouncement,
    type DbProjectHomepage,
} from '../database/entities/projectHomepages';

const RECENTLY_VIEWED_STATEMENT_TIMEOUT_MS = 10_000;
const RECENTLY_VIEWED_WINDOW_DAYS = 90;

type RankableGroupAssignment = {
    groupUuid: string;
    priority: number;
    createdAt: Date;
    assignmentUuid: string;
};

const compareGroupAssignmentPriority = (
    left: RankableGroupAssignment,
    right: RankableGroupAssignment,
): number => {
    if (left.priority !== right.priority) {
        return left.priority - right.priority;
    }
    const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdDelta !== 0) {
        return createdDelta;
    }
    return left.assignmentUuid.localeCompare(right.assignmentUuid);
};

// Always rewrite every group in the project so a partial reorder cannot
// leave two groups sharing a priority.
export const rankGroupPriorities = (
    existing: RankableGroupAssignment[],
    requestedOrder: string[],
): { groupUuid: string; priority: number }[] => {
    const existingByUuid = new Map(
        existing.map((assignment) => [assignment.groupUuid, assignment]),
    );
    const ranked: string[] = [];
    const seen = new Set<string>();

    for (const groupUuid of requestedOrder) {
        if (existingByUuid.has(groupUuid) && !seen.has(groupUuid)) {
            ranked.push(groupUuid);
            seen.add(groupUuid);
        }
    }

    const remaining = existing
        .filter((assignment) => !seen.has(assignment.groupUuid))
        .sort(compareGroupAssignmentPriority)
        .map((assignment) => assignment.groupUuid);

    return [...ranked, ...remaining].map((groupUuid, priority) => ({
        groupUuid,
        priority,
    }));
};

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
        try {
            return await this.database.transaction(async (trx) => {
                await trx.raw(
                    `SET LOCAL statement_timeout = ${RECENTLY_VIEWED_STATEMENT_TIMEOUT_MS}`,
                );
                const { rows } = await trx.raw<{
                    rows: Array<{
                        content_type: 'chart' | 'dashboard';
                        content_uuid: string;
                        viewed_at: Date;
                    }>;
                }>(
                    `
            -- Opening a dashboard records a view for every tile on it, which
            -- would bury the dashboard the user actually opened. Tiles are
            -- tagged where we can, but several code paths write untagged rows,
            -- so chart views that land in the moments around one of this
            -- user's dashboard views are dropped too. That check is done with a
            -- window over the user's merged view stream rather than an
            -- anti-join: a range predicate cannot be hashed, so the anti-join
            -- degraded to every chart view × every dashboard view.
            WITH user_views AS (
                SELECT 'chart' AS kind, chart_uuid AS content_uuid, context, timestamp
                FROM analytics_chart_views
                WHERE user_uuid = :userUuid
                  AND timestamp > now() - make_interval(days => :windowDays)
                UNION ALL
                SELECT 'dashboard' AS kind, dashboard_uuid AS content_uuid, context, timestamp
                FROM analytics_dashboard_views
                WHERE user_uuid = :userUuid
                  AND timestamp > now() - make_interval(days => :windowDays) - interval '15 seconds'
            ),
            shadowed_chart_views AS (
                SELECT kind, content_uuid, context, timestamp,
                       count(*) FILTER (WHERE kind = 'dashboard') OVER (
                           ORDER BY timestamp
                           RANGE BETWEEN interval '15 seconds' PRECEDING
                                     AND interval '2 seconds' FOLLOWING
                       ) AS nearby_dashboard_views
                FROM user_views
            )
            SELECT content_type, content_uuid, max(viewed_at) AS viewed_at
            FROM (
                SELECT 'chart' AS content_type,
                       acv.content_uuid,
                       acv.timestamp AS viewed_at
                FROM shadowed_chart_views acv
                JOIN saved_queries sq ON sq.saved_query_uuid = acv.content_uuid
                JOIN spaces s ON s.space_id = sq.space_id
                JOIN projects p ON p.project_id = s.project_id
                WHERE acv.kind = 'chart'
                  AND p.project_uuid = :projectUuid
                  AND sq.deleted_at IS NULL
                  AND s.deleted_at IS NULL
                  AND (acv.context ->> 'source') IS DISTINCT FROM 'dashboard'
                  AND acv.nearby_dashboard_views = 0
                UNION ALL
                SELECT 'dashboard' AS content_type,
                       adv.dashboard_uuid AS content_uuid,
                       adv.timestamp AS viewed_at
                FROM analytics_dashboard_views adv
                JOIN dashboards d ON d.dashboard_uuid = adv.dashboard_uuid
                JOIN spaces s ON s.space_id = d.space_id
                JOIN projects p ON p.project_id = s.project_id
                WHERE adv.user_uuid = :userUuid
                  AND adv.timestamp > now() - make_interval(days => :windowDays)
                  AND p.project_uuid = :projectUuid
                  AND d.deleted_at IS NULL
                  AND s.deleted_at IS NULL
            ) views
            GROUP BY content_type, content_uuid
            ORDER BY viewed_at DESC
            LIMIT :limit
            `,
                    {
                        userUuid,
                        projectUuid,
                        limit,
                        windowDays: RECENTLY_VIEWED_WINDOW_DAYS,
                    },
                );
                return rows.map((row) => ({
                    contentType: row.content_type,
                    uuid: row.content_uuid,
                    viewedAt: row.viewed_at,
                }));
            });
        } catch (error) {
            if (!isStatementTimeout(error)) throw error;
            Logger.warn(
                `Recently viewed query exceeded ${RECENTLY_VIEWED_STATEMENT_TIMEOUT_MS}ms in project ${projectUuid}; returning no items`,
            );
            return [];
        }
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
            .orderBy([
                {
                    column: `${HomepageAssignmentsTableName}.priority`,
                    order: 'asc',
                },
                {
                    column: `${HomepageAssignmentsTableName}.created_at`,
                    order: 'asc',
                },
                {
                    column: `${HomepageAssignmentsTableName}.assignment_uuid`,
                    order: 'asc',
                },
            ])
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
            const existing = await trx(HomepageAssignmentsTableName)
                .where({
                    project_uuid: projectUuid,
                    target_type: 'group',
                })
                .select(
                    'group_uuid',
                    'priority',
                    'created_at',
                    'assignment_uuid',
                );

            const ranked = rankGroupPriorities(
                existing.flatMap((row) =>
                    row.group_uuid
                        ? [
                              {
                                  groupUuid: row.group_uuid,
                                  priority: row.priority,
                                  createdAt: row.created_at,
                                  assignmentUuid: row.assignment_uuid,
                              },
                          ]
                        : [],
                ),
                groupUuids,
            );

            await Promise.all(
                ranked.map(({ groupUuid, priority }) =>
                    trx(HomepageAssignmentsTableName)
                        .where({
                            project_uuid: projectUuid,
                            target_type: 'group',
                            group_uuid: groupUuid,
                        })
                        .update({ priority }),
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
                .orderBy([
                    {
                        column: `${HomepageAssignmentsTableName}.priority`,
                        order: 'asc',
                    },
                    {
                        column: `${HomepageAssignmentsTableName}.created_at`,
                        order: 'asc',
                    },
                    {
                        column: `${HomepageAssignmentsTableName}.assignment_uuid`,
                        order: 'asc',
                    },
                ])
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
            scheduledPublishAt: row.scheduled_publish_at ?? null,
            createdByUserUuid: row.created_by_user_uuid,
            authorName: row.author_name?.trim() || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private static authorNameSql(db: Knex) {
        return db.raw(
            `TRIM(CONCAT(${UserTableName}.first_name, ' ', ${UserTableName}.last_name)) as author_name`,
        );
    }

    // `returning('*')` on the announcements table has no author join, so
    // publish/create paths would otherwise notify Slack with a null author.
    private async hydrateAuthorNames(
        announcements: ProjectAnnouncement[],
        db: Knex = this.database,
    ): Promise<ProjectAnnouncement[]> {
        const userUuids = [
            ...new Set(
                announcements
                    .map((announcement) => announcement.createdByUserUuid)
                    .filter((uuid): uuid is string => uuid != null),
            ),
        ];
        if (userUuids.length === 0) {
            return announcements;
        }
        const users = await db(UserTableName)
            .whereIn('user_uuid', userUuids)
            .select('user_uuid', 'first_name', 'last_name');
        const authorNameByUserUuid = new Map(
            users.map((user) => [
                user.user_uuid,
                `${user.first_name} ${user.last_name}`.trim() || null,
            ]),
        );
        return announcements.map((announcement) => ({
            ...announcement,
            authorName: announcement.createdByUserUuid
                ? (authorNameByUserUuid.get(announcement.createdByUserUuid) ??
                  null)
                : null,
        }));
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
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${AnnouncementsTableName}.created_by_user_uuid`,
            )
            .select(
                `${AnnouncementsTableName}.*`,
                ProjectHomepageModel.authorNameSql(this.database),
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
        published: boolean;
        scheduledPublishAt: Date | null;
    }): Promise<ProjectAnnouncement> {
        const [row] = await this.database(AnnouncementsTableName)
            .insert({
                project_uuid: data.projectUuid,
                title: data.title,
                body: data.body,
                category: data.category,
                created_by_user_uuid: data.createdByUserUuid,
                published_at: data.published ? new Date() : null,
                // A published announcement has no deferred notification —
                // the caller fires Slack immediately instead.
                pending_slack_channel_id: data.published
                    ? null
                    : data.pendingSlackChannelId,
                scheduled_publish_at: data.published
                    ? null
                    : data.scheduledPublishAt,
            })
            .returning('*');
        const mapped = ProjectHomepageModel.mapDbAnnouncement(row);
        const [announcement] = await this.hydrateAuthorNames([mapped]);
        return announcement ?? mapped;
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
                // Scheduled announcements are embargoed until their own
                // instant — a homepage republish must not fire them early.
                .whereNull('scheduled_publish_at')
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
            const pending = rows.reduce<
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
            const announcements = await this.hydrateAuthorNames(
                pending.map(({ announcement }) => announcement),
                trx,
            );
            return pending.map((item, index) => ({
                ...item,
                announcement: announcements[index] ?? item.announcement,
            }));
        });
    }

    /**
     * Publishes a single unpublished announcement (publish-now / scheduled)
     * job) or every due scheduled announcement across projects (sweep).
     * Idempotent by construction: rows are locked with skipLocked and the
     * update re-checks `published_at IS NULL`, so a job+sweep race publishes
     * — and returns the Slack channel to notify — exactly once.
     */
    async publishPendingAnnouncements(options: {
        announcementUuid?: string;
        onlyDue: boolean;
    }): Promise<
        Array<{
            announcement: ProjectAnnouncement;
            slackChannelId: string | null;
        }>
    > {
        return this.database.transaction(async (trx) => {
            let query = trx(AnnouncementsTableName)
                .whereNull('published_at')
                .forUpdate()
                .skipLocked()
                .select('announcement_uuid', 'pending_slack_channel_id');
            if (options.announcementUuid) {
                query = query.where(
                    'announcement_uuid',
                    options.announcementUuid,
                );
            }
            if (options.onlyDue) {
                query = query
                    .whereNotNull('scheduled_publish_at')
                    .where('scheduled_publish_at', '<=', new Date());
            }
            const pending = await query;
            if (pending.length === 0) return [];

            const rows = await trx(AnnouncementsTableName)
                .whereIn(
                    'announcement_uuid',
                    pending.map((row) => row.announcement_uuid),
                )
                .whereNull('published_at')
                .update({
                    published_at: new Date(),
                    pending_slack_channel_id: null,
                    scheduled_publish_at: null,
                })
                .returning('*');

            const slackChannelByUuid = new Map(
                pending.map((row) => [
                    row.announcement_uuid,
                    row.pending_slack_channel_id,
                ]),
            );
            const published = rows.map((row) => ({
                announcement: ProjectHomepageModel.mapDbAnnouncement(row),
                slackChannelId:
                    slackChannelByUuid.get(row.announcement_uuid) ?? null,
            }));
            const announcements = await this.hydrateAuthorNames(
                published.map(({ announcement }) => announcement),
                trx,
            );
            return published.map((item, index) => ({
                ...item,
                announcement: announcements[index] ?? item.announcement,
            }));
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
                    ...(update.scheduledPublishAt !== undefined && {
                        scheduled_publish_at: update.scheduledPublishAt,
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
