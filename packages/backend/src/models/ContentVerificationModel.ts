import {
    ContentType,
    DBFieldTypes,
    type ContentVerificationInfo,
    type VerifiedContentListItem,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ContentVerificationTableName,
    type CreateDbContentVerification,
} from '../database/entities/contentVerification';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import {
    SavedChartsTableName,
    SavedChartVersionFieldsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';

type ContentVerificationModelArguments = {
    database: Knex;
};

export class ContentVerificationModel {
    private readonly database: Knex;

    constructor({ database }: ContentVerificationModelArguments) {
        this.database = database;
    }

    async getByContent(
        contentType: ContentType,
        contentUuid: string,
    ): Promise<ContentVerificationInfo | null> {
        const row = await this.database(ContentVerificationTableName)
            .leftJoin(
                UserTableName,
                `${ContentVerificationTableName}.verified_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(`${ContentVerificationTableName}.content_type`, contentType)
            .where(`${ContentVerificationTableName}.content_uuid`, contentUuid)
            .select(
                `${ContentVerificationTableName}.verified_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            )
            .first();

        if (!row) return null;

        return {
            verifiedBy: {
                userUuid: row.user_uuid,
                firstName: row.first_name,
                lastName: row.last_name,
            },
            verifiedAt: row.verified_at,
        };
    }

    async getByContentUuids(
        contentType: ContentType,
        contentUuids: string[],
    ): Promise<Map<string, ContentVerificationInfo>> {
        if (contentUuids.length === 0) return new Map();

        const rows = await this.database(ContentVerificationTableName)
            .leftJoin(
                UserTableName,
                `${ContentVerificationTableName}.verified_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(`${ContentVerificationTableName}.content_type`, contentType)
            .whereIn(
                `${ContentVerificationTableName}.content_uuid`,
                contentUuids,
            )
            .select(
                `${ContentVerificationTableName}.content_uuid`,
                `${ContentVerificationTableName}.verified_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            );

        const result = new Map<string, ContentVerificationInfo>();
        for (const row of rows) {
            result.set(row.content_uuid, {
                verifiedBy: {
                    userUuid: row.user_uuid,
                    firstName: row.first_name ?? '',
                    lastName: row.last_name ?? '',
                },
                verifiedAt: row.verified_at,
            });
        }
        return result;
    }

    async verify(
        contentType: ContentType,
        contentUuid: string,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const data: CreateDbContentVerification = {
            content_type: contentType,
            content_uuid: contentUuid,
            project_uuid: projectUuid,
            verified_by_user_uuid: userUuid,
        };

        await this.database(ContentVerificationTableName)
            .insert(data)
            .onConflict(['content_type', 'content_uuid'])
            .merge({
                verified_by_user_uuid: userUuid,
                verified_at: this.database.fn.now(),
            });
    }

    async unverify(
        contentType: ContentType,
        contentUuid: string,
    ): Promise<void> {
        await this.database(ContentVerificationTableName)
            .where({
                content_type: contentType,
                content_uuid: contentUuid,
            })
            .delete();
    }

    async getAllForProject(
        projectUuid: string,
    ): Promise<VerifiedContentListItem[]> {
        const chartRows = await this.database(ContentVerificationTableName)
            .innerJoin(
                SavedChartsTableName,
                `${ContentVerificationTableName}.content_uuid`,
                `${SavedChartsTableName}.saved_query_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SavedChartsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${ContentVerificationTableName}.verified_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(`${ContentVerificationTableName}.project_uuid`, projectUuid)
            .where(
                `${ContentVerificationTableName}.content_type`,
                ContentType.CHART,
            )
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select(
                `${ContentVerificationTableName}.content_verification_uuid`,
                `${ContentVerificationTableName}.content_type`,
                `${ContentVerificationTableName}.content_uuid`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.description`,
                `${SavedChartsTableName}.views_count`,
                `${SavedChartsTableName}.last_version_chart_kind`,
                this.database
                    .ref(`${SavedChartsTableName}.last_version_updated_at`)
                    .as('last_updated_at'),
                this.database(SavedChartVersionsTableName)
                    .select('explore_name')
                    .whereRaw(
                        `${SavedChartVersionsTableName}.saved_query_id = ${SavedChartsTableName}.saved_query_id`,
                    )
                    .orderBy('created_at', 'desc')
                    .limit(1)
                    .as('explore_name'),
                `${SpaceTableName}.space_uuid`,
                this.database.ref(`${SpaceTableName}.name`).as('space_name'),
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${ContentVerificationTableName}.verified_at`,
            );

        const dashboardRows = await this.database(ContentVerificationTableName)
            .innerJoin(
                DashboardsTableName,
                `${ContentVerificationTableName}.content_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${ContentVerificationTableName}.verified_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(`${ContentVerificationTableName}.project_uuid`, projectUuid)
            .where(
                `${ContentVerificationTableName}.content_type`,
                ContentType.DASHBOARD,
            )
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select(
                `${ContentVerificationTableName}.content_verification_uuid`,
                `${ContentVerificationTableName}.content_type`,
                `${ContentVerificationTableName}.content_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${DashboardsTableName}.views_count`,
                this.database(DashboardVersionsTableName)
                    .select('created_at')
                    .whereRaw(
                        `${DashboardVersionsTableName}.dashboard_id = ${DashboardsTableName}.dashboard_id`,
                    )
                    .orderBy('created_at', 'desc')
                    .limit(1)
                    .as('last_updated_at'),
                `${SpaceTableName}.space_uuid`,
                this.database.ref(`${SpaceTableName}.name`).as('space_name'),
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${ContentVerificationTableName}.verified_at`,
            );

        const toBaseItem = (row: {
            content_verification_uuid: string;
            content_uuid: string;
            name: string;
            description: string | null;
            views_count: number;
            last_updated_at: Date | null;
            space_uuid: string;
            space_name: string;
            user_uuid: string;
            first_name: string;
            last_name: string;
            verified_at: Date;
        }) => ({
            uuid: row.content_verification_uuid,
            contentUuid: row.content_uuid,
            name: row.name,
            description: row.description ?? null,
            spaceUuid: row.space_uuid,
            spaceName: row.space_name,
            views: row.views_count,
            lastUpdatedAt: row.last_updated_at,
            verifiedBy: {
                userUuid: row.user_uuid,
                firstName: row.first_name,
                lastName: row.last_name,
            },
            verifiedAt: row.verified_at,
        });

        const charts: VerifiedContentListItem[] = chartRows.map((row) => ({
            ...toBaseItem(row),
            contentType: ContentType.CHART,
            chartKind: row.last_version_chart_kind,
            exploreName: row.explore_name ?? null,
        }));

        const dashboards: VerifiedContentListItem[] = dashboardRows.map(
            (row) => ({
                ...toBaseItem(row),
                contentType: ContentType.DASHBOARD,
            }),
        );

        return [...charts, ...dashboards];
    }

    async getVerifiedFieldUsage(
        projectUuid: string,
    ): Promise<Map<string, number>> {
        const rows = await this.database(ContentVerificationTableName)
            .innerJoin(
                SavedChartsTableName,
                `${ContentVerificationTableName}.content_uuid`,
                `${SavedChartsTableName}.saved_query_uuid`,
            )
            .innerJoin(
                SavedChartVersionsTableName,
                `${SavedChartsTableName}.saved_query_id`,
                `${SavedChartVersionsTableName}.saved_query_id`,
            )
            .innerJoin(
                SavedChartVersionFieldsTableName,
                `${SavedChartVersionsTableName}.saved_queries_version_id`,
                `${SavedChartVersionFieldsTableName}.saved_queries_version_id`,
            )
            .where(`${ContentVerificationTableName}.project_uuid`, projectUuid)
            .where(
                `${ContentVerificationTableName}.content_type`,
                ContentType.CHART,
            )
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .where(
                `${SavedChartVersionsTableName}.saved_queries_version_id`,
                this.database.raw(
                    `(SELECT MAX(saved_queries_version_id) FROM ${SavedChartVersionsTableName} WHERE saved_query_id = ${SavedChartsTableName}.saved_query_id)`,
                ),
            )
            .groupBy(
                `${SavedChartVersionFieldsTableName}.name`,
                `${SavedChartVersionFieldsTableName}.field_type`,
            )
            .select({
                field_id: `${SavedChartVersionFieldsTableName}.name`,
                field_type: `${SavedChartVersionFieldsTableName}.field_type`,
                usage: this.database.raw(
                    `count(distinct ${SavedChartsTableName}.saved_query_id)`,
                ),
            });

        const result = new Map<string, number>();
        for (const row of rows as Array<{
            field_id: string;
            field_type: DBFieldTypes;
            usage: string;
        }>) {
            result.set(`${row.field_id}::${row.field_type}`, Number(row.usage));
        }
        return result;
    }
}
