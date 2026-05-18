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
import { DashboardsTableName } from '../database/entities/dashboards';
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
                `${SpaceTableName}.space_uuid`,
                this.database.ref(`${SpaceTableName}.name`).as('space_name'),
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${ContentVerificationTableName}.verified_at`,
            );

        return [...chartRows, ...dashboardRows].map((row) => ({
            uuid: row.content_verification_uuid,
            contentType: row.content_type as ContentType,
            contentUuid: row.content_uuid,
            name: row.name,
            spaceUuid: row.space_uuid,
            spaceName: row.space_name,
            verifiedBy: {
                userUuid: row.user_uuid,
                firstName: row.first_name,
                lastName: row.last_name,
            },
            verifiedAt: row.verified_at,
        }));
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
