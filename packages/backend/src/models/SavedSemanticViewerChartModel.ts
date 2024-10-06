import {
    generateSlug,
    NotFoundError,
    SavedSemanticViewerChart,
    SpaceSummary,
    type SemanticViewerChartCreate,
    type SemanticViewerChartUpdate,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbProject, ProjectTableName } from '../database/entities/projects';
import {
    DbSavedSemanticViewerChart,
    DBSavedSemanticViewerChartVersion,
    SavedSemanticViewerChartsTableName,
    SavedSemanticViewerChartVersionsTableName,
} from '../database/entities/savedSemanticViewerCharts';
import { DbSpace, SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { generateUniqueSlug } from '../utils/SlugUtils';

type SelectSavedSemanticViewerChart = Pick<
    DbSavedSemanticViewerChart,
    | 'saved_semantic_viewer_chart_uuid'
    | 'name'
    | 'description'
    | 'slug'
    | 'dashboard_uuid'
    | 'created_at'
    | 'last_version_updated_at'
    | 'views_count'
    | 'first_viewed_at'
    | 'last_viewed_at'
> &
    Pick<
        DBSavedSemanticViewerChartVersion,
        'semantic_layer_view' | 'semantic_layer_query' | 'config' | 'chart_kind'
    > &
    Pick<DbSpace, 'space_uuid'> &
    Pick<DbProject, 'project_uuid'> &
    Pick<DbOrganization, 'organization_uuid'> & {
        updated_at: Date;
        spaceName: string;
        space_is_private: boolean;
        dashboardName: string | null;
        created_by_user_uuid: string | null;
        created_by_user_first_name: string | null;
        created_by_user_last_name: string | null;
        last_version_updated_by_user_uuid: string | null;
        last_version_updated_by_user_first_name: string | null;
        last_version_updated_by_user_last_name: string | null;
    };

export class SavedSemanticViewerChartModel {
    private database: Knex;

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    static convertSelectSavedSemanticViewerChart(
        row: SelectSavedSemanticViewerChart,
    ): Omit<SavedSemanticViewerChart, 'space'> & {
        space: Pick<SpaceSummary, 'uuid' | 'name' | 'isPrivate'>;
    } {
        return {
            savedSemanticViewerChartUuid: row.saved_semantic_viewer_chart_uuid,
            name: row.name,
            description: row.description,
            slug: row.slug,
            createdAt: row.created_at,
            createdBy: row.created_by_user_uuid
                ? {
                      userUuid: row.created_by_user_uuid,
                      firstName: row.created_by_user_first_name ?? '',
                      lastName: row.created_by_user_last_name ?? '',
                  }
                : null,
            lastUpdatedAt: row.last_version_updated_at,
            lastUpdatedBy: row.last_version_updated_by_user_uuid
                ? {
                      userUuid: row.last_version_updated_by_user_uuid,
                      firstName:
                          row.last_version_updated_by_user_first_name ?? '',
                      lastName:
                          row.last_version_updated_by_user_last_name ?? '',
                  }
                : null,

            config: row.config as SavedSemanticViewerChart['config'],
            semanticLayerView: row.semantic_layer_view,
            semanticLayerQuery:
                row.semantic_layer_query as SavedSemanticViewerChart['semanticLayerQuery'],

            chartKind: row.chart_kind,
            space: {
                uuid: row.space_uuid,
                name: row.spaceName,
                isPrivate: row.space_is_private,
            },
            project: {
                projectUuid: row.project_uuid,
            },
            dashboard: row.dashboard_uuid
                ? {
                      uuid: row.dashboard_uuid,
                      name: row.dashboardName ?? '',
                  }
                : null,
            organization: {
                organizationUuid: row.organization_uuid,
            },
            views: row.views_count,
            firstViewedAt: row.first_viewed_at || new Date(),
            lastViewedAt: row.last_viewed_at || new Date(),
        };
    }

    async find(options: {
        uuid?: string;
        slug?: string;
        projectUuid?: string;
    }) {
        return this.database
            .from(SavedSemanticViewerChartsTableName)
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedSemanticViewerChartsTableName}.dashboard_uuid`,
            )
            .innerJoin(SpaceTableName, function spaceJoin() {
                this.on(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                ).orOn(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${SavedSemanticViewerChartsTableName}.space_uuid`,
                );
            })
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(
                SavedSemanticViewerChartVersionsTableName,
                `${SavedSemanticViewerChartsTableName}.saved_semantic_viewer_chart_uuid`,
                `${SavedSemanticViewerChartVersionsTableName}.saved_semantic_viewer_chart_uuid`,
            )
            .leftJoin(
                `${UserTableName} as createdByUser`,
                `${SavedSemanticViewerChartsTableName}.created_by_user_uuid`,
                `createdByUser.user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as updatedByUser`,
                `${SavedSemanticViewerChartsTableName}.last_version_updated_by_user_uuid`,
                `updatedByUser.user_uuid`,
            )
            .select<SelectSavedSemanticViewerChart[]>([
                `${ProjectTableName}.project_uuid`,
                `${SavedSemanticViewerChartsTableName}.saved_semantic_viewer_chart_uuid`,
                `${SavedSemanticViewerChartsTableName}.name`,
                `${SavedSemanticViewerChartsTableName}.description`,
                `${SavedSemanticViewerChartsTableName}.dashboard_uuid`,
                `${SavedSemanticViewerChartsTableName}.created_at`,
                `${SavedSemanticViewerChartsTableName}.slug`,
                `${SavedSemanticViewerChartsTableName}.last_version_updated_at`,
                `${SavedSemanticViewerChartsTableName}.views_count`,
                `${SavedSemanticViewerChartsTableName}.first_viewed_at`,
                `${SavedSemanticViewerChartsTableName}.last_viewed_at`,
                `${DashboardsTableName}.name as dashboardName`,
                `${SavedSemanticViewerChartVersionsTableName}.semantic_layer_view`,
                `${SavedSemanticViewerChartVersionsTableName}.semantic_layer_query`,
                `${SavedSemanticViewerChartVersionsTableName}.config`,
                `${SavedSemanticViewerChartVersionsTableName}.chart_kind`,
                `${OrganizationTableName}.organization_uuid`,
                `createdByUser.user_uuid as created_by_user_uuid`,
                `createdByUser.first_name as created_by_user_first_name`,
                `createdByUser.last_name as created_by_user_last_name`,
                `updatedByUser.user_uuid as last_version_updated_by_user_uuid`,
                `updatedByUser.first_name as last_version_updated_by_user_first_name`,
                `updatedByUser.last_name as last_version_updated_by_user_last_name`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name as spaceName`,
                `${SpaceTableName}.is_private as space_is_private`,
            ])
            .where((builder) => {
                if (options.uuid) {
                    void builder.where(
                        `${SavedSemanticViewerChartsTableName}.saved_semantic_viewer_chart_uuid`,
                        options.uuid,
                    );
                }

                if (options.slug) {
                    void builder.where(
                        `${SavedSemanticViewerChartsTableName}.slug`,
                        options.slug,
                    );
                }

                if (options.projectUuid) {
                    void builder.where(
                        `${ProjectTableName}.project_uuid`,
                        options.projectUuid,
                    );
                }

                // Required filter to join only the latest version
                void builder.where(
                    `${SavedSemanticViewerChartVersionsTableName}.created_at`,
                    '=',
                    this.database
                        .from(SavedSemanticViewerChartVersionsTableName)
                        .max('created_at')
                        .where(
                            `${SavedSemanticViewerChartVersionsTableName}.saved_semantic_viewer_chart_uuid`,
                            this.database.ref(
                                `${SavedSemanticViewerChartsTableName}.saved_semantic_viewer_chart_uuid`,
                            ),
                        ),
                );
            })
            .orderBy(
                `${SavedSemanticViewerChartVersionsTableName}.created_at`,
                'desc',
            );
    }

    async getBySlug(projectUuid: string, slug: string) {
        const results = await this.find({ slug, projectUuid });
        const [result] = results;
        if (!result) {
            throw new NotFoundError('Saved semantic layer query not found');
        }
        return SavedSemanticViewerChartModel.convertSelectSavedSemanticViewerChart(
            result,
        );
    }

    async getByUuid(projectUuid: string, uuid: string) {
        const results = await this.find({ uuid, projectUuid });
        const [result] = results;
        if (!result) {
            throw new NotFoundError('Saved semantic layer query not found');
        }
        return SavedSemanticViewerChartModel.convertSelectSavedSemanticViewerChart(
            result,
        );
    }

    static async createVersion(
        trx: Knex,
        data: Pick<
            SemanticViewerChartCreate,
            'semanticLayerView' | 'semanticLayerQuery' | 'config'
        > & {
            savedSemanticViewerChartUuid: string;
            userUuid: string;
        },
    ): Promise<string> {
        const [
            {
                saved_semantic_viewer_chart_version_uuid:
                    savedSemanticViewerChartVersionUuid,
            },
        ] = await trx(SavedSemanticViewerChartVersionsTableName).insert(
            {
                saved_semantic_viewer_chart_uuid:
                    data.savedSemanticViewerChartUuid,
                config: data.config,
                semantic_layer_view: data.semanticLayerView,
                semantic_layer_query: data.semanticLayerQuery,
                chart_kind: data.config.type,
                created_by_user_uuid: data.userUuid,
            },
            ['saved_semantic_viewer_chart_version_uuid'],
        );
        await trx(SavedSemanticViewerChartsTableName)
            .update({
                last_version_chart_kind: data.config.type,
                last_version_updated_at: new Date(),
                last_version_updated_by_user_uuid: data.userUuid,
            })
            .where(
                'saved_semantic_viewer_chart_uuid',
                data.savedSemanticViewerChartUuid,
            );
        return savedSemanticViewerChartVersionUuid;
    }

    async create(
        userUuid: string,
        projectUuid: string,
        data: SemanticViewerChartCreate,
    ): Promise<{
        slug: string;
        savedSemanticViewerChartUuid: string;
        savedSemanticViewerChartVersionUuid: string;
    }> {
        return this.database.transaction(async (trx) => {
            const [
                {
                    saved_semantic_viewer_chart_uuid:
                        savedSemanticViewerChartUuid,
                    slug,
                },
            ] = await trx(SavedSemanticViewerChartsTableName).insert(
                {
                    slug: await generateUniqueSlug(
                        trx,
                        SavedSemanticViewerChartsTableName,
                        data.name,
                    ),
                    name: data.name,
                    description: data.description,
                    created_by_user_uuid: userUuid,
                    project_uuid: projectUuid,
                    space_uuid: data.spaceUuid,
                    dashboard_uuid: null,
                },
                ['saved_semantic_viewer_chart_uuid', 'slug'],
            );
            const savedSemanticViewerChartVersionUuid =
                await SavedSemanticViewerChartModel.createVersion(trx, {
                    savedSemanticViewerChartUuid,
                    userUuid,
                    config: data.config,
                    semanticLayerView: data.semanticLayerView,
                    semanticLayerQuery: data.semanticLayerQuery,
                });
            return {
                slug,
                savedSemanticViewerChartUuid,
                savedSemanticViewerChartVersionUuid,
            };
        });
    }

    async update({
        userUuid,
        savedSemanticViewerChartUuid,
        update,
    }: {
        userUuid: string;
        savedSemanticViewerChartUuid: string;
        update: SemanticViewerChartUpdate;
    }): Promise<{
        savedSemanticViewerChartUuid: string;
        savedSemanticViewerChartVersionUuid: string | null;
    }> {
        return this.database.transaction(async (trx) => {
            if (update.unversionedData) {
                await trx(SavedSemanticViewerChartsTableName)
                    .update({
                        name: update.unversionedData.name,
                        description: update.unversionedData.description,
                        space_uuid: update.unversionedData.spaceUuid,
                    })
                    .where(
                        'saved_semantic_viewer_chart_uuid',
                        savedSemanticViewerChartUuid,
                    );
            }

            let savedSemanticViewerChartVersionUuid: string | null = null;
            if (update.versionedData) {
                savedSemanticViewerChartVersionUuid =
                    await SavedSemanticViewerChartModel.createVersion(trx, {
                        savedSemanticViewerChartUuid,
                        userUuid,
                        config: update.versionedData.config,
                        semanticLayerView:
                            update.versionedData.semanticLayerView,
                        semanticLayerQuery:
                            update.versionedData.semanticLayerQuery,
                    });
            }

            return {
                savedSemanticViewerChartUuid,
                savedSemanticViewerChartVersionUuid,
            };
        });
    }

    async delete(uuid: string) {
        await this.database(SavedSemanticViewerChartsTableName)
            .where('saved_semantic_viewer_chart_uuid', uuid)
            .delete();
    }
}
