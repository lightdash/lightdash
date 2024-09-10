import {
    generateSlug,
    NotFoundError,
    SavedSemanticLayer,
    SpaceSummary,
    type SemanticLayerCreateChart,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbProject, ProjectTableName } from '../database/entities/projects';
import {
    DbSavedSemanticLayer,
    DbSavedSemanticLayerVersion,
    SavedSemanticLayerTableName,
    SavedSemanticLayerVersionsTableName,
} from '../database/entities/savedSemanticLayer';
import { DbSpace, SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';

type SelectSavedSemanticLayer = Pick<
    DbSavedSemanticLayer,
    | 'saved_semantic_layer_uuid'
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
        DbSavedSemanticLayerVersion,
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

export class SavedSemanticLayerModel {
    private database: Knex;

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    static convertSelectSavedSemanticLayer(row: SelectSavedSemanticLayer): Omit<
        SavedSemanticLayer,
        'space'
    > & {
        space: Pick<SpaceSummary, 'uuid' | 'name' | 'isPrivate'>;
    } {
        return {
            savedSemanticLayerUuid: row.saved_semantic_layer_uuid,
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

            config: row.config as SavedSemanticLayer['config'],
            semanticLayerView: row.semantic_layer_view,
            semanticLayerQuery:
                row.semantic_layer_query as SavedSemanticLayer['semanticLayerQuery'],

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
            .from(SavedSemanticLayerTableName)
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedSemanticLayerTableName}.dashboard_uuid`,
            )
            .innerJoin(SpaceTableName, function spaceJoin() {
                this.on(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                ).orOn(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${SavedSemanticLayerTableName}.space_uuid`,
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
                SavedSemanticLayerVersionsTableName,
                `${SavedSemanticLayerTableName}.saved_semantic_layer_uuid`,
                `${SavedSemanticLayerVersionsTableName}.saved_semantic_layer_uuid`,
            )
            .leftJoin(
                `${UserTableName} as createdByUser`,
                `${SavedSemanticLayerTableName}.created_by_user_uuid`,
                `createdByUser.user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as updatedByUser`,
                `${SavedSemanticLayerTableName}.last_version_updated_by_user_uuid`,
                `updatedByUser.user_uuid`,
            )
            .select<SelectSavedSemanticLayer[]>([
                `${ProjectTableName}.project_uuid`,
                `${SavedSemanticLayerTableName}.saved_semantic_layer_uuid`,
                `${SavedSemanticLayerTableName}.name`,
                `${SavedSemanticLayerTableName}.description`,
                `${SavedSemanticLayerTableName}.dashboard_uuid`,
                `${SavedSemanticLayerTableName}.created_at`,
                `${SavedSemanticLayerTableName}.slug`,
                `${SavedSemanticLayerTableName}.last_version_updated_at`,
                `${SavedSemanticLayerTableName}.views_count`,
                `${SavedSemanticLayerTableName}.first_viewed_at`,
                `${SavedSemanticLayerTableName}.last_viewed_at`,
                `${DashboardsTableName}.name as dashboardName`,
                `${SavedSemanticLayerVersionsTableName}.semantic_layer_view`,
                `${SavedSemanticLayerVersionsTableName}.semantic_layer_query`,
                `${SavedSemanticLayerVersionsTableName}.config`,
                `${SavedSemanticLayerVersionsTableName}.chart_kind`,
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
                        `${SavedSemanticLayerTableName}.saved_semantic_layer_uuid`,
                        options.uuid,
                    );
                }

                if (options.slug) {
                    void builder.where(
                        `${SavedSemanticLayerTableName}.slug`,
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
                    `${SavedSemanticLayerVersionsTableName}.created_at`,
                    '=',
                    this.database
                        .from(SavedSemanticLayerVersionsTableName)
                        .max('created_at')
                        .where(
                            `${SavedSemanticLayerVersionsTableName}.saved_semantic_layer_uuid`,
                            this.database.ref(
                                `${SavedSemanticLayerTableName}.saved_semantic_layer_uuid`,
                            ),
                        ),
                );
            })
            .orderBy(
                `${SavedSemanticLayerVersionsTableName}.created_at`,
                'desc',
            );
    }

    async getBySlug(projectUuid: string, slug: string) {
        const results = await this.find({ slug, projectUuid });
        const [result] = results;
        if (!result) {
            throw new NotFoundError('Saved semantic layer query not found');
        }
        return SavedSemanticLayerModel.convertSelectSavedSemanticLayer(result);
    }

    async getByUuid(uuid: string, options: { projectUuid?: string }) {
        const results = await this.find({ uuid, ...options });
        const [result] = results;
        if (!result) {
            throw new NotFoundError('Saved semantic layer query not found');
        }
        return SavedSemanticLayerModel.convertSelectSavedSemanticLayer(result);
    }

    static async createVersion(
        trx: Knex,
        data: Pick<
            SemanticLayerCreateChart,
            'semanticLayerView' | 'semanticLayerQuery' | 'config'
        > & {
            savedSemanticLayerUuid: string;
            userUuid: string;
        },
    ): Promise<string> {
        const [
            {
                saved_semantic_layer_version_uuid:
                    savedSemanticLayerVersionUuid,
            },
        ] = await trx(SavedSemanticLayerVersionsTableName).insert(
            {
                saved_semantic_layer_uuid: data.savedSemanticLayerUuid,
                config: data.config,
                semantic_layer_view: data.semanticLayerView,
                semantic_layer_query: data.semanticLayerQuery,
                chart_kind: data.config.type,
                created_by_user_uuid: data.userUuid,
            },
            ['saved_semantic_layer_version_uuid'],
        );
        await trx(SavedSemanticLayerTableName)
            .update({
                last_version_chart_kind: data.config.type,
                last_version_updated_at: new Date(),
                last_version_updated_by_user_uuid: data.userUuid,
            })
            .where('saved_semantic_layer_uuid', data.savedSemanticLayerUuid);
        return savedSemanticLayerVersionUuid;
    }

    static async generateSavedSemanticLayerSlug(trx: Knex, name: string) {
        const baseSlug = generateSlug(name);
        const matchingSlugs: string[] = await trx(SavedSemanticLayerTableName)
            .select('slug')
            .where('slug', 'like', `${baseSlug}%`)
            .pluck('slug');
        let slug = generateSlug(name);
        let inc = 0;
        while (matchingSlugs.includes(slug)) {
            inc += 1;
            slug = `${baseSlug}-${inc}`; // generate new slug with number suffix
        }
        return slug;
    }

    async create(
        userUuid: string,
        projectUuid: string,
        data: SemanticLayerCreateChart,
    ): Promise<{
        slug: string;
        savedSemanticLayerUuid: string;
        savedSemanticLayerVersionUuid: string;
    }> {
        return this.database.transaction(async (trx) => {
            const [
                { saved_semantic_layer_uuid: savedSemanticLayerUuid, slug },
            ] = await trx(SavedSemanticLayerTableName).insert(
                {
                    slug: await SavedSemanticLayerModel.generateSavedSemanticLayerSlug(
                        trx,
                        data.name,
                    ),
                    name: data.name,
                    description: data.description,
                    created_by_user_uuid: userUuid,
                    project_uuid: projectUuid,
                    space_uuid: data.spaceUuid,
                    dashboard_uuid: null,
                },
                ['saved_semantic_layer_uuid', 'slug'],
            );
            const savedSemanticLayerVersionUuid =
                await SavedSemanticLayerModel.createVersion(trx, {
                    savedSemanticLayerUuid,
                    userUuid,
                    config: data.config,
                    semanticLayerView: data.semanticLayerView,
                    semanticLayerQuery: data.semanticLayerQuery,
                });
            return {
                slug,
                savedSemanticLayerUuid,
                savedSemanticLayerVersionUuid,
            };
        });
    }
}
