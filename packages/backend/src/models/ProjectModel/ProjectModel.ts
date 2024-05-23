import {
    AlreadyExistsError,
    CreateDbtCloudIntegration,
    CreateProject,
    CreateWarehouseCredentials,
    DbtCloudIntegration,
    DbtProjectConfig,
    Explore,
    ExploreError,
    generateSlug,
    isExploreError,
    NotExistsError,
    OrganizationProject,
    PreviewContentMapping,
    Project,
    ProjectGroupAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectSummary,
    ProjectType,
    sensitiveCredentialsFieldNames,
    sensitiveDbtCredentialsFieldNames,
    SpaceSummary,
    SupportedDbtVersions,
    TablesConfiguration,
    UnexpectedServerError,
    UpdateMetadata,
    UpdateProject,
    WarehouseCredentials,
    WarehouseTypes,
} from '@lightdash/common';

import {
    WarehouseCatalog,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { Knex } from 'knex';
import { map, omit, zip } from 'lodash';
import uniqWith from 'lodash/uniqWith';
import { DatabaseError } from 'pg';
import { LightdashConfig } from '../../config/parseConfig';
import {
    CatalogTableName,
    DbCatalog,
    DbCatalogIn,
} from '../../database/entities/catalog';
import {
    DashboardViewsTableName,
    DbDashboard,
} from '../../database/entities/dashboards';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../../database/entities/organizations';
import { PinnedListTableName } from '../../database/entities/pinnedList';
import { ProjectGroupAccessTableName } from '../../database/entities/projectGroupAccess';
import { DbProjectMembership } from '../../database/entities/projectMemberships';
import {
    CachedExploresTableName,
    CachedExploreTableName,
    CachedWarehouseTableName,
    DbCachedExplores,
    DbCachedWarehouse,
    DbProject,
    ProjectTableName,
} from '../../database/entities/projects';
import {
    DbSavedChart,
    InsertChart,
    SavedChartCustomSqlDimensionsTableName,
} from '../../database/entities/savedCharts';
import { DbSpace } from '../../database/entities/spaces';
import { DbUser } from '../../database/entities/users';
import { WarehouseCredentialTableName } from '../../database/entities/warehouseCredentials';
import Logger from '../../logging/logger';
import { wrapOtelSpan } from '../../utils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    convertExploresToCatalog,
    ExploreCatalog,
} from '../CatalogModel/utils';
import Transaction = Knex.Transaction;

export type ProjectModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
    encryptionUtil: EncryptionUtil;
};

const CACHED_EXPLORES_PG_LOCK_NAMESPACE = 1;

export class ProjectModel {
    protected database: Knex;

    private lightdashConfig: LightdashConfig;

    private encryptionUtil: EncryptionUtil;

    constructor(args: ProjectModelArguments) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
        this.encryptionUtil = args.encryptionUtil;
    }

    static mergeMissingDbtConfigSecrets(
        incompleteConfig: DbtProjectConfig,
        completeConfig: DbtProjectConfig,
    ): DbtProjectConfig {
        if (incompleteConfig.type !== completeConfig.type) {
            return incompleteConfig;
        }
        return {
            ...incompleteConfig,
            ...sensitiveDbtCredentialsFieldNames.reduce(
                (sum, secretKey) =>
                    !(incompleteConfig as any)[secretKey] &&
                    (completeConfig as any)[secretKey]
                        ? {
                              ...sum,
                              [secretKey]: (completeConfig as any)[secretKey],
                          }
                        : sum,
                {},
            ),
        };
    }

    static mergeMissingWarehouseSecrets(
        incompleteConfig: CreateWarehouseCredentials,
        completeConfig: CreateWarehouseCredentials,
    ): CreateWarehouseCredentials {
        if (incompleteConfig.type !== completeConfig.type) {
            return incompleteConfig;
        }
        return {
            ...incompleteConfig,
            ...sensitiveCredentialsFieldNames.reduce(
                (sum, secretKey) =>
                    !(incompleteConfig as any)[secretKey] &&
                    (completeConfig as any)[secretKey]
                        ? {
                              ...sum,
                              [secretKey]: (completeConfig as any)[secretKey],
                          }
                        : sum,
                {},
            ),
        };
    }

    static mergeMissingProjectConfigSecrets(
        incompleteProjectConfig: UpdateProject,
        completeProjectConfig: Project & {
            warehouseConnection?: CreateWarehouseCredentials;
        },
    ): UpdateProject {
        return {
            ...incompleteProjectConfig,
            dbtConnection: ProjectModel.mergeMissingDbtConfigSecrets(
                incompleteProjectConfig.dbtConnection,
                completeProjectConfig.dbtConnection,
            ),
            warehouseConnection: completeProjectConfig.warehouseConnection
                ? ProjectModel.mergeMissingWarehouseSecrets(
                      incompleteProjectConfig.warehouseConnection,
                      completeProjectConfig.warehouseConnection,
                  )
                : incompleteProjectConfig.warehouseConnection,
        };
    }

    async getAllByOrganizationUuid(
        organizationUuid: string,
    ): Promise<OrganizationProject[]> {
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotExistsError('Cannot find organization');
        }
        const projects = await this.database('projects')
            .leftJoin(
                WarehouseCredentialTableName,
                'projects.project_id',
                'warehouse_credentials.project_id',
            )
            .select(
                'project_uuid',
                'name',
                'project_type',
                `warehouse_type`,
                `encrypted_credentials`,
            )
            .where('organization_id', orgs[0].organization_id);

        return projects.map<OrganizationProject>(
            ({
                name,
                project_uuid,
                project_type,
                warehouse_type,
                encrypted_credentials,
            }) => {
                try {
                    const warehouseCredentials = JSON.parse(
                        this.encryptionUtil.decrypt(encrypted_credentials),
                    ) as CreateWarehouseCredentials;
                    return {
                        name,
                        projectUuid: project_uuid,
                        type: project_type,
                        warehouseType: warehouse_type as WarehouseTypes,
                        requireUserCredentials:
                            !!warehouseCredentials.requireUserCredentials,
                    };
                } catch (e) {
                    throw new UnexpectedServerError(
                        'Unexpected error: failed to parse warehouse credentials',
                    );
                }
            },
        );
    }

    private async upsertWarehouseConnection(
        trx: Transaction,
        projectId: number,
        data: CreateWarehouseCredentials,
    ): Promise<void> {
        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionUtil.encrypt(
                JSON.stringify(data),
            );
        } catch (e) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        await trx('warehouse_credentials')
            .insert({
                project_id: projectId,
                warehouse_type: data.type,
                encrypted_credentials: encryptedCredentials,
            })
            .onConflict('project_id')
            .merge();
    }

    async hasProjects(organizationUuid: string): Promise<boolean> {
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotExistsError('Cannot find organization');
        }

        const projects = await this.database('projects')
            .where('organization_id', orgs[0].organization_id)
            .select('project_uuid');
        return projects.length > 0;
    }

    async create(
        organizationUuid: string,
        data: CreateProject,
    ): Promise<string> {
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotExistsError('Cannot find organization');
        }
        return this.database.transaction(async (trx) => {
            let encryptedCredentials: Buffer;
            try {
                encryptedCredentials = this.encryptionUtil.encrypt(
                    JSON.stringify(data.dbtConnection),
                );
            } catch (e) {
                throw new UnexpectedServerError('Could not save credentials.');
            }

            // Make sure the project to copy exists and is owned by the same organization
            const copiedProjects = data.upstreamProjectUuid
                ? await trx('projects')
                      .where('organization_id', orgs[0].organization_id)
                      .andWhere('project_uuid', data.upstreamProjectUuid)
                : [];
            const [project] = await trx('projects')
                .insert({
                    name: data.name,
                    project_type: data.type,
                    organization_id: orgs[0].organization_id,
                    dbt_connection_type: data.dbtConnection.type,
                    dbt_connection: encryptedCredentials,
                    copied_from_project_uuid:
                        copiedProjects.length === 1
                            ? copiedProjects[0].project_uuid
                            : null,
                    dbt_version: data.dbtVersion,
                })
                .returning('*');

            await this.upsertWarehouseConnection(
                trx,
                project.project_id,
                data.warehouseConnection,
            );

            await trx('spaces').insert({
                project_id: project.project_id,
                name: 'Shared',
                is_private: false,
                slug: generateSlug('Shared'),
            });

            return project.project_uuid;
        });
    }

    async update(projectUuid: string, data: UpdateProject): Promise<void> {
        await this.database.transaction(async (trx) => {
            let encryptedCredentials: Buffer;
            try {
                encryptedCredentials = this.encryptionUtil.encrypt(
                    JSON.stringify(data.dbtConnection),
                );
            } catch (e) {
                throw new UnexpectedServerError('Could not save credentials.');
            }

            const projects = await trx('projects')
                .update({
                    name: data.name,
                    dbt_connection_type: data.dbtConnection.type,
                    dbt_connection: encryptedCredentials,
                    dbt_version: data.dbtVersion,
                })
                .where('project_uuid', projectUuid)
                .returning('*');
            if (projects.length === 0) {
                throw new UnexpectedServerError('Could not update project.');
            }
            const [project] = projects;

            await this.upsertWarehouseConnection(
                trx,
                project.project_id,
                data.warehouseConnection,
            );
        });
    }

    async delete(projectUuid: string): Promise<void> {
        await this.database('projects')
            .where('project_uuid', projectUuid)
            .delete();
    }

    async getWithSensitiveFields(
        projectUuid: string,
    ): Promise<Project & { warehouseConnection?: CreateWarehouseCredentials }> {
        type QueryResult = (
            | {
                  name: string;
                  project_type: ProjectType;
                  dbt_connection: Buffer | null;
                  encrypted_credentials: null;
                  warehouse_type: null;
                  organization_uuid: string;
                  pinned_list_uuid?: string;
                  dbt_version: SupportedDbtVersions;
                  copied_from_project_uuid?: string;
              }
            | {
                  name: string;
                  project_type: ProjectType;
                  dbt_connection: Buffer | null;
                  encrypted_credentials: Buffer;
                  warehouse_type: string;
                  organization_uuid: string;
                  pinned_list_uuid?: string;
                  dbt_version: SupportedDbtVersions;
                  copied_from_project_uuid?: string;
              }
        )[];
        return wrapOtelSpan(
            'ProjectModel.getWithSensitiveFields',
            {},
            async () => {
                const projects = await this.database('projects')
                    .leftJoin(
                        WarehouseCredentialTableName,
                        'warehouse_credentials.project_id',
                        'projects.project_id',
                    )
                    .leftJoin(
                        OrganizationTableName,
                        'organizations.organization_id',
                        'projects.organization_id',
                    )
                    .leftJoin(
                        PinnedListTableName,
                        'pinned_list.project_uuid',
                        'projects.project_uuid',
                    )
                    .column([
                        this.database.ref('name').withSchema(ProjectTableName),
                        this.database
                            .ref('project_type')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('dbt_connection')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('encrypted_credentials')
                            .withSchema(WarehouseCredentialTableName),
                        this.database
                            .ref('warehouse_type')
                            .withSchema(WarehouseCredentialTableName),
                        this.database
                            .ref('organization_uuid')
                            .withSchema(OrganizationTableName),
                        this.database
                            .ref('pinned_list_uuid')
                            .withSchema(PinnedListTableName),
                        this.database
                            .ref('dbt_version')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('copied_from_project_uuid')
                            .withSchema(ProjectTableName),
                    ])
                    .select<QueryResult>()
                    .where('projects.project_uuid', projectUuid);
                if (projects.length === 0) {
                    throw new NotExistsError(
                        `Cannot find project with id: ${projectUuid}`,
                    );
                }
                const [project] = projects;
                if (!project.dbt_connection) {
                    throw new NotExistsError(
                        'Project has no valid dbt credentials',
                    );
                }
                let dbtSensitiveCredentials: DbtProjectConfig;
                try {
                    dbtSensitiveCredentials = JSON.parse(
                        this.encryptionUtil.decrypt(project.dbt_connection),
                    ) as DbtProjectConfig;
                } catch (e) {
                    throw new UnexpectedServerError(
                        'Failed to load dbt credentials',
                    );
                }
                const result: Omit<Project, 'warehouseConnection'> = {
                    organizationUuid: project.organization_uuid,
                    projectUuid,
                    name: project.name,
                    type: project.project_type,
                    dbtConnection: dbtSensitiveCredentials,
                    pinnedListUuid: project.pinned_list_uuid,
                    dbtVersion: project.dbt_version,
                    upstreamProjectUuid: project.copied_from_project_uuid,
                };
                if (!project.warehouse_type) {
                    return result;
                }
                let sensitiveCredentials: CreateWarehouseCredentials;
                try {
                    sensitiveCredentials = JSON.parse(
                        this.encryptionUtil.decrypt(
                            project.encrypted_credentials,
                        ),
                    ) as CreateWarehouseCredentials;
                } catch (e) {
                    throw new UnexpectedServerError(
                        'Failed to load warehouse credentials',
                    );
                }
                return {
                    ...result,
                    warehouseConnection: sensitiveCredentials,
                };
            },
        );
    }

    async getSummary(projectUuid: string): Promise<ProjectSummary> {
        const project = await this.database(ProjectTableName)
            .leftJoin(
                OrganizationTableName,
                'projects.organization_id',
                'organizations.organization_id',
            )
            .select<
                Pick<
                    DbProject,
                    | 'name'
                    | 'project_uuid'
                    | 'project_type'
                    | 'copied_from_project_uuid'
                > &
                    Pick<DbOrganization, 'organization_uuid'>
            >([
                `${ProjectTableName}.name`,
                `${ProjectTableName}.project_uuid`,
                `${OrganizationTableName}.organization_uuid`,
                `${ProjectTableName}.copied_from_project_uuid`,
            ])
            .where('projects.project_uuid', projectUuid)
            .first();
        if (!project) {
            throw new NotExistsError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        return {
            organizationUuid: project.organization_uuid,
            projectUuid: project.project_uuid,
            name: project.name,
            type: project.project_type,
            upstreamProjectUuid: project.copied_from_project_uuid || undefined,
        };
    }

    async get(projectUuid: string): Promise<Project> {
        const project = await this.getWithSensitiveFields(projectUuid);
        const sensitiveCredentials = project.warehouseConnection;

        const nonSensitiveDbtCredentials = Object.fromEntries(
            Object.entries(project.dbtConnection).filter(
                ([key]) =>
                    !sensitiveDbtCredentialsFieldNames.includes(key as any),
            ),
        ) as DbtProjectConfig;
        const nonSensitiveCredentials = sensitiveCredentials
            ? (Object.fromEntries(
                  Object.entries(sensitiveCredentials).filter(
                      ([key]) =>
                          !sensitiveCredentialsFieldNames.includes(key as any),
                  ),
              ) as WarehouseCredentials)
            : undefined;
        return {
            organizationUuid: project.organizationUuid,
            projectUuid,
            name: project.name,
            type: project.type,
            dbtConnection: nonSensitiveDbtCredentials,
            warehouseConnection: nonSensitiveCredentials,
            pinnedListUuid: project.pinnedListUuid,
            dbtVersion: project.dbtVersion,
            upstreamProjectUuid: project.upstreamProjectUuid || undefined,
        };
    }

    async getTablesConfiguration(
        projectUuid: string,
    ): Promise<TablesConfiguration> {
        const projects = await this.database(ProjectTableName)
            .select(['table_selection_type', 'table_selection_value'])
            .where('project_uuid', projectUuid);
        if (projects.length === 0) {
            throw new NotExistsError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        return {
            tableSelection: {
                type: projects[0].table_selection_type,
                value: projects[0].table_selection_value,
            },
        };
    }

    async updateTablesConfiguration(
        projectUuid: string,
        data: TablesConfiguration,
    ): Promise<void> {
        await this.database(ProjectTableName)
            .update({
                table_selection_type: data.tableSelection.type,
                table_selection_value: data.tableSelection.value,
            })
            .where('project_uuid', projectUuid);
    }

    async getExploresFromCache(
        projectUuid: string,
    ): Promise<(Explore | ExploreError)[] | undefined> {
        const explores = await this.database(CachedExploresTableName)
            .select(['explores'])
            .where('project_uuid', projectUuid)
            .limit(1);
        if (explores.length > 0) return explores[0].explores;
        return undefined;
    }

    static convertMetricFiltersFieldIdsToFieldRef = (
        explore: Explore | ExploreError,
    ) => {
        if (isExploreError(explore)) return explore;
        const convertedExplore = { ...explore };
        if (convertedExplore.tables) {
            Object.values(convertedExplore.tables).forEach((table) => {
                if (table.metrics) {
                    Object.values(table.metrics).forEach((metric) => {
                        if (metric.filters) {
                            metric.filters.forEach((filter) => {
                                // @ts-expect-error cached explore types might not be up to date
                                const { fieldId, fieldRef, ...rest } =
                                    filter.target;
                                // eslint-disable-next-line no-param-reassign
                                filter.target = {
                                    ...rest,
                                    fieldRef: fieldRef ?? fieldId,
                                };
                            });
                        }
                    });
                }
            });
        }

        return convertedExplore;
    };

    private getExploreQueryBuilder(projectUuid: string) {
        return this.database(CachedExploresTableName)
            .select<{ explore: Explore | ExploreError }[]>(['explore'])
            .crossJoin(
                this.database.raw('jsonb_array_elements(explores) as explore'),
            )
            .where('project_uuid', projectUuid)
            .first();
    }

    async getExploreFromCache(
        projectUuid: string,
        exploreName: string,
    ): Promise<Explore | ExploreError> {
        return wrapOtelSpan(
            'ProjectModel.getExploreFromCache',
            {},
            async (span) => {
                // check individually cached explore
                let exploreCache = await this.database(CachedExploreTableName)
                    .select('explore')
                    .where('name', exploreName)
                    .andWhere('project_uuid', projectUuid)
                    .first();

                span.setAttribute(
                    'foundIndividualExploreCache',
                    !!exploreCache,
                );
                if (!exploreCache) {
                    // fallback: check all cached explores
                    exploreCache = await this.getExploreQueryBuilder(
                        projectUuid,
                    ).andWhereRaw("explore->>'name' = ?", [exploreName]);
                    if (exploreCache === undefined) {
                        throw new NotExistsError(
                            `Explore "${exploreName}" does not exist.`,
                        );
                    }
                }
                return ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                    exploreCache.explore,
                );
            },
        );
    }

    async findExploreByTableName(
        projectUuid: string,
        tableName: string,
    ): Promise<Explore | ExploreError | undefined> {
        return wrapOtelSpan(
            'ProjectModel.findExploreByTableName',
            {},
            async (span) => {
                // check individually cached explore
                let exploreCache = await this.database(CachedExploreTableName)
                    .columns({
                        explore: 'explore',
                        baseMatch: this.database.raw(
                            "? = explore->>'baseTable'",
                            [tableName],
                        ),
                    })
                    .select()
                    .whereRaw('? = ANY(table_names)', tableName)
                    .andWhere('project_uuid', projectUuid)
                    .orderBy('baseMatch', 'desc')
                    .first();

                span.setAttribute(
                    'foundIndividualExploreCache',
                    !!exploreCache,
                );
                if (!exploreCache) {
                    // fallback: check all cached explores
                    // try finding explore via base table name
                    exploreCache = await this.getExploreQueryBuilder(
                        projectUuid,
                    ).andWhereRaw("explore->>'baseTable' = ?", [tableName]);

                    if (!exploreCache) {
                        // try finding explore via joined table alias
                        // Note: there is an edge case where we return the wrong explore because join table aliases are not unique
                        exploreCache = await this.getExploreQueryBuilder(
                            projectUuid,
                        ).andWhereRaw(
                            "(explore->>'tables')::json->? IS NOT NULL",
                            [tableName],
                        );
                    }
                }

                return exploreCache
                    ? ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                          exploreCache.explore,
                      )
                    : undefined;
            },
        );
    }

    async indexCatalog(
        projectUuid: string,
        cachedExplores: (Explore & { cachedExploreUuid: string })[],
    ): Promise<[DbCatalog, ExploreCatalog][]> {
        if (cachedExplores.length === 0) return [];

        const catalogItems = convertExploresToCatalog(
            projectUuid,
            cachedExplores,
        );

        const transactionInserts = await this.database.transaction(
            async (trx) => {
                await trx(CatalogTableName)
                    .where('project_uuid', projectUuid)
                    .delete();

                const inserts = await trx(CatalogTableName)
                    .insert(
                        catalogItems.map((catalogItem, _index) => ({
                            ...omit(catalogItem, ['field_type']),
                        })),
                    )
                    .returning('*');

                return inserts;
            },
        );

        return transactionInserts.map<[DbCatalog, ExploreCatalog]>(
            (insert, index) => [insert, catalogItems[index]],
        );
    }

    static getExploresWithCacheUuids(
        explores: (Explore | ExploreError)[],
        cachedExplore: { name: string; cached_explore_uuid: string }[],
    ) {
        return explores.reduce<(Explore & { cachedExploreUuid: string })[]>(
            (acc, explore) => {
                if (isExploreError(explore)) return acc;
                const cachedExploreUuid = cachedExplore.find(
                    (cached) => cached.name === explore.name,
                )?.cached_explore_uuid;
                if (!cachedExploreUuid) {
                    Logger.error(
                        `Could not find cached explore uuid for explore ${explore.name}`,
                    );
                    return acc;
                }
                return [
                    ...acc,
                    {
                        ...explore,
                        cachedExploreUuid,
                    },
                ];
            },
            [],
        );
    }

    async saveExploresToCache(
        projectUuid: string,
        explores: (Explore | ExploreError)[],
    ): Promise<DbCachedExplores> {
        return wrapOtelSpan(
            'ProjectModel.saveExploresToCache',
            {},
            async () => {
                // delete previous individually cached explores
                await this.database(CachedExploreTableName)
                    .where('project_uuid', projectUuid)
                    .delete();

                // We don't support multiple explores with the same name at the moment
                const uniqueExplores = uniqWith(
                    explores,
                    (a, b) => a.name === b.name,
                );

                // cache explores individually
                const cachedExplore = await this.database(
                    CachedExploreTableName,
                )
                    .insert(
                        uniqueExplores.map((explore) => ({
                            project_uuid: projectUuid,
                            name: explore.name,
                            table_names: Object.keys(explore.tables || {}),
                            explore: JSON.stringify(explore),
                        })),
                    )
                    .onConflict(['project_uuid', 'name'])
                    .merge()
                    .returning(['name', 'cached_explore_uuid']);

                const exploresWithCachedExploreUuid =
                    ProjectModel.getExploresWithCacheUuids(
                        explores,
                        cachedExplore,
                    );
                await this.indexCatalog(
                    projectUuid,
                    exploresWithCachedExploreUuid,
                );

                // cache explores together
                const [cachedExplores] = await this.database(
                    CachedExploresTableName,
                )
                    .insert({
                        project_uuid: projectUuid,
                        explores: JSON.stringify(uniqueExplores),
                    })
                    .onConflict('project_uuid')
                    .merge()
                    .returning('*');

                return cachedExplores;
            },
        );
    }

    async tryAcquireProjectLock(
        projectUuid: string,
        onLockAcquired: () => Promise<void>,
        onLockFailed?: () => Promise<void>,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // pg_advisory_xact_lock takes a 64bit integer as key
            // we can't use project_uuid (uuidv4) as key, not even a hash,
            // so we will be using autoinc project_id from DB.
            const projectLock = await trx.raw(`
                SELECT pg_try_advisory_xact_lock(${CACHED_EXPLORES_PG_LOCK_NAMESPACE}, project_id)
                FROM projects
                WHERE project_uuid = '${projectUuid}' LIMIT 1  `);

            if (projectLock.rows.length === 0) return; // No project with uuid in DB
            const acquiresLock = projectLock.rows[0].pg_try_advisory_xact_lock;
            if (acquiresLock) {
                await onLockAcquired();
            } else if (onLockFailed) {
                await onLockFailed();
            }
        });
    }

    async getWarehouseFromCache(
        projectUuid: string,
    ): Promise<WarehouseCatalog | undefined> {
        const warehouses = await this.database(CachedWarehouseTableName)
            .select(['warehouse'])
            .where('project_uuid', projectUuid)
            .limit(1);
        if (warehouses.length > 0) return warehouses[0].warehouse;
        return undefined;
    }

    async saveWarehouseToCache(
        projectUuid: string,
        warehouse: WarehouseCatalog,
    ): Promise<DbCachedWarehouse> {
        const [cachedWarehouse] = await this.database(CachedWarehouseTableName)
            .insert({
                project_uuid: projectUuid,
                warehouse: JSON.stringify(warehouse),
            })
            .onConflict('project_uuid')
            .merge()
            .returning('*');

        return cachedWarehouse;
    }

    async getProjectMemberAccess(
        projectUuid: string,
        userUuid: string,
    ): Promise<ProjectMemberProfile | undefined> {
        type QueryResult = {
            user_uuid: string;
            email: string;
            role: ProjectMemberRole;
            first_name: string;
            last_name: string;
        };
        const [projectMemberProfile] = await this.database(
            'project_memberships',
        )
            .leftJoin('users', 'project_memberships.user_id', 'users.user_id')
            .leftJoin('emails', 'emails.user_id', 'users.user_id')
            .leftJoin(
                'projects',
                'project_memberships.project_id',
                'projects.project_id',
            )
            .select<QueryResult[]>()
            .where('project_uuid', projectUuid)
            .where('users.user_uuid', userUuid)
            .andWhere('is_primary', true);

        if (projectMemberProfile === undefined) {
            return undefined;
        }
        return {
            userUuid: projectMemberProfile.user_uuid,
            projectUuid,
            role: projectMemberProfile.role,
            email: projectMemberProfile.email,
            firstName: projectMemberProfile.first_name,
            lastName: projectMemberProfile.last_name,
        };
    }

    async getProjectAccess(
        projectUuid: string,
    ): Promise<ProjectMemberProfile[]> {
        type QueryResult = {
            user_uuid: string;
            email: string;
            role: ProjectMemberRole;
            first_name: string;
            last_name: string;
        };
        const projectMemberships = await this.database('project_memberships')
            .leftJoin('users', 'project_memberships.user_id', 'users.user_id')
            .leftJoin('emails', 'emails.user_id', 'users.user_id')
            .leftJoin(
                'projects',
                'project_memberships.project_id',
                'projects.project_id',
            )
            .select<QueryResult[]>()
            .where('project_uuid', projectUuid)
            .andWhere('is_primary', true);

        return projectMemberships.map((membership) => ({
            userUuid: membership.user_uuid,
            email: membership.email,
            role: membership.role,
            firstName: membership.first_name,
            projectUuid,
            lastName: membership.last_name,
        }));
    }

    async createProjectAccess(
        projectUuid: string,
        email: string,
        role: ProjectMemberRole,
    ): Promise<void> {
        try {
            const [project] = await this.database('projects')
                .select('project_id', 'organization_id')
                .where('project_uuid', projectUuid);

            const [user] = await this.database('users')
                .leftJoin('emails', 'emails.user_id', 'users.user_id')
                .leftJoin(
                    OrganizationMembershipsTableName,
                    `${OrganizationMembershipsTableName}.user_id`,
                    'users.user_id',
                )
                .select('users.user_id')
                .where('email', email)
                .andWhere(
                    `${OrganizationMembershipsTableName}.organization_id`,
                    project.organization_id,
                );
            if (user === undefined) {
                throw new NotExistsError(
                    `Can't find user with email ${email} in the organization`,
                );
            }
            await this.database('project_memberships').insert({
                project_id: project.project_id,
                role,
                user_id: user.user_id,
            });
        } catch (error: any) {
            if (
                error instanceof DatabaseError &&
                error.constraint ===
                    'project_memberships_project_id_user_id_unique'
            ) {
                throw new AlreadyExistsError(
                    `This user email ${email} already has access to this project`,
                );
            }
            throw error;
        }
    }

    async updateProjectAccess(
        projectUuid: string,
        userUuid: string,
        role: ProjectMemberRole,
    ): Promise<void> {
        await this.database.raw<(DbProjectMembership & DbProject & DbUser)[]>(
            `
                UPDATE project_memberships AS m
                SET role = :role FROM projects AS p, users AS u
                WHERE p.project_id = m.project_id
                  AND u.user_id = m.user_id
                  AND user_uuid = :userUuid
                  AND p.project_uuid = :projectUuid
                    RETURNING *
            `,
            { projectUuid, userUuid, role },
        );
    }

    async updateMetadata(
        projectUuid: string,
        data: UpdateMetadata,
    ): Promise<void> {
        await this.database('projects')
            .update({
                copied_from_project_uuid: data.upstreamProjectUuid, // if upstreamProjectUuid is undefined, it will do nothing, if it is null, it will be unset
            })
            .where('project_uuid', projectUuid);
    }

    async deleteProjectAccess(
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.raw<(DbProjectMembership & DbProject & DbUser)[]>(
            `
                DELETE
                FROM project_memberships AS m USING projects AS p, users AS u
                WHERE p.project_id = m.project_id
                  AND u.user_id = m.user_id
                  AND user_uuid = :userUuid
                  AND p.project_uuid = :projectUuid
            `,
            { projectUuid, userUuid },
        );
    }

    async getProjectGroupAccesses(projectUuid: string) {
        const projectGroupAccesses = await this.database(
            ProjectGroupAccessTableName,
        )
            .select<ProjectGroupAccess[]>({
                projectUuid: 'project_uuid',
                groupUuid: 'group_uuid',
                role: 'role',
            })
            .where('project_uuid', projectUuid);

        return projectGroupAccesses;
    }

    async findDbtCloudIntegration(
        projectUuid: string,
    ): Promise<DbtCloudIntegration | undefined> {
        const [row] = await this.database('dbt_cloud_integrations')
            .select(['metrics_job_id'])
            .innerJoin(
                'projects',
                'projects.project_id',
                'dbt_cloud_integrations.project_id',
            )
            .where('project_uuid', projectUuid);
        if (row === undefined) {
            return undefined;
        }
        return {
            metricsJobId: row.metrics_job_id,
        };
    }

    async findDbtCloudIntegrationWithSecrets(
        projectUuid: string,
    ): Promise<CreateDbtCloudIntegration | undefined> {
        const [row] = await this.database('dbt_cloud_integrations')
            .select(['metrics_job_id', 'service_token'])
            .innerJoin(
                'projects',
                'projects.project_id',
                'dbt_cloud_integrations.project_id',
            )
            .where('project_uuid', projectUuid);
        if (row === undefined) {
            return undefined;
        }
        const serviceToken = this.encryptionUtil.decrypt(row.service_token);
        return {
            metricsJobId: row.metrics_job_id,
            serviceToken,
        };
    }

    async upsertDbtCloudIntegration(
        projectUuid: string,
        integration: CreateDbtCloudIntegration,
    ): Promise<void> {
        const [project] = await this.database('projects')
            .select(['project_id'])
            .where('project_uuid', projectUuid);
        if (project === undefined) {
            throw new NotExistsError(
                `Cannot find project with id '${projectUuid}'`,
            );
        }
        const encryptedServiceToken = this.encryptionUtil.encrypt(
            integration.serviceToken,
        );
        await this.database('dbt_cloud_integrations')
            .insert({
                project_id: project.project_id,
                service_token: encryptedServiceToken,
                metrics_job_id: integration.metricsJobId,
            })
            .onConflict('project_id')
            .merge();
    }

    async deleteDbtCloudIntegration(projectUuid: string): Promise<void> {
        await this.database.raw(
            `
                DELETE
                FROM dbt_cloud_integrations AS i USING projects AS p
                WHERE p.project_id = i.project_id
                  AND p.project_uuid = ?`,
            [projectUuid],
        );
    }

    async getWarehouseCredentialsForProject(
        projectUuid: string,
    ): Promise<CreateWarehouseCredentials> {
        const [row] = await this.database('warehouse_credentials')
            .innerJoin(
                'projects',
                'warehouse_credentials.project_id',
                'projects.project_id',
            )
            .select(['warehouse_type', 'encrypted_credentials'])
            .where('project_uuid', projectUuid);
        if (row === undefined) {
            throw new NotExistsError(
                `Cannot find any warehouse credentials for project.`,
            );
        }
        try {
            return JSON.parse(
                this.encryptionUtil.decrypt(row.encrypted_credentials),
            ) as CreateWarehouseCredentials;
        } catch (e) {
            throw new UnexpectedServerError(
                'Unexpected error: failed to parse warehouse credentials',
            );
        }
    }

    async duplicateContent(
        projectUuid: string,
        previewProjectUuid: string,
        spaces: Pick<SpaceSummary, 'uuid'>[],
    ) {
        Logger.info(
            `Duplicating content from ${projectUuid} to ${previewProjectUuid}`,
        );

        return this.database.transaction(async (trx) => {
            const [previewProject] = await trx('projects').where(
                'project_uuid',
                previewProjectUuid,
            );

            const [project] = await trx('projects')
                .where('project_uuid', projectUuid)
                .select('project_id');
            const projectId = project.project_id;

            const dbSpaces = await trx('spaces').whereIn(
                'space_uuid',
                spaces.map((s) => s.uuid),
            );

            Logger.info(
                `Duplicating ${spaces.length} spaces on ${previewProjectUuid}`,
            );
            const spaceIds = dbSpaces.map((s) => s.space_id);
            const spaceUuids = dbSpaces.map((s) => s.space_uuid);

            const newSpaces =
                spaces.length > 0
                    ? await trx('spaces')
                          .insert(
                              dbSpaces.map((d) => {
                                  type CloneSpace = Omit<
                                      DbSpace,
                                      | 'space_id'
                                      | 'space_uuid'
                                      | 'search_vector'
                                  > & {
                                      search_vector?: undefined;
                                      space_id?: number;
                                      space_uuid?: string;
                                  };
                                  const createSpace: CloneSpace = {
                                      ...d,
                                      search_vector: undefined,
                                      space_id: undefined,
                                      space_uuid: undefined,
                                      project_id: previewProject.project_id,
                                  };
                                  // Remove the keys for the autogenerated fields
                                  // Some databases do not support undefined values
                                  delete createSpace.search_vector;
                                  delete createSpace.space_id;
                                  delete createSpace.space_uuid;
                                  return createSpace;
                              }),
                          )
                          .returning('*')
                    : [];

            const spaceMapping = dbSpaces.map((s, i) => ({
                id: s.space_id,
                uuid: s.space_uuid,
                newId: newSpaces[i].space_id,
                newUuid: newSpaces[i].space_uuid,
            }));

            const getNewSpaceId = (oldSpacId: number): number =>
                spaceMapping.find((s) => s.id === oldSpacId)?.newId!;

            const getNewSpaceUuid = (oldSpaceUuid: string): string =>
                spaceMapping.find((s) => s.uuid === oldSpaceUuid)?.newUuid!;

            const spaceUserAccesses = await trx('space_user_access').whereIn(
                'space_uuid',
                spaceUuids,
            );

            const newSpaceUserAccess =
                spaceUserAccesses.length > 0
                    ? await trx('space_user_access')
                          .insert(
                              spaceUserAccesses.map((d) => ({
                                  ...d,
                                  space_uuid: getNewSpaceUuid(d.space_uuid),
                              })),
                          )
                          .returning('*')
                    : [];

            const charts = await trx('saved_queries')
                .leftJoin('spaces', 'saved_queries.space_id', 'spaces.space_id')
                .whereIn('saved_queries.space_id', spaceIds)
                .andWhere('spaces.project_id', projectId)
                .select<DbSavedChart[]>('saved_queries.*');

            Logger.info(
                `Duplicating ${charts.length} charts on ${previewProjectUuid}`,
            );
            type CloneChart = InsertChart & {
                search_vector?: string;
                saved_query_id?: number;
                saved_query_uuid?: string;
            };

            const newCharts =
                charts.length > 0
                    ? await trx('saved_queries')
                          .insert(
                              charts.map((d) => {
                                  if (!d.space_id) {
                                      throw new Error(
                                          `Chart ${d.saved_query_id} has no space_id`,
                                      );
                                  }
                                  const createChart: CloneChart = {
                                      ...d,
                                      search_vector: undefined,
                                      saved_query_id: undefined,
                                      saved_query_uuid: undefined,
                                      space_id: getNewSpaceId(d.space_id),
                                      dashboard_uuid: null,
                                  };
                                  delete createChart.search_vector;
                                  delete createChart.saved_query_id;
                                  delete createChart.saved_query_uuid;
                                  return createChart;
                              }),
                          )
                          .returning('*')
                    : [];

            const chartsInDashboards = await trx('saved_queries')
                .leftJoin(
                    'dashboards',
                    'saved_queries.dashboard_uuid',
                    'dashboards.dashboard_uuid',
                )
                .leftJoin('spaces', 'dashboards.space_id', 'spaces.space_id')
                .where('spaces.project_id', projectId)
                .andWhere('saved_queries.space_id', null)
                .select<DbSavedChart[]>('saved_queries.*');

            Logger.info(
                `Duplicating ${chartsInDashboards.length} charts in dashboards on ${previewProjectUuid}`,
            );

            // We also copy charts in dashboards, we will replace the dashboard_uuid later
            const newChartsInDashboards =
                chartsInDashboards.length > 0
                    ? await trx('saved_queries')
                          .insert(
                              chartsInDashboards.map((d) => {
                                  if (!d.dashboard_uuid) {
                                      throw new Error(
                                          `Chart in dashboard ${d.saved_query_id} has no dashboard_uuid`,
                                      );
                                  }
                                  const createChart: CloneChart = {
                                      ...d,
                                      search_vector: undefined,
                                      space_id: null,
                                      dashboard_uuid: d.dashboard_uuid, // we'll update this later
                                  };
                                  delete createChart.search_vector;
                                  delete createChart.saved_query_id;
                                  delete createChart.saved_query_uuid;

                                  return createChart;
                              }),
                          )
                          .returning('*')
                    : [];
            const chartInSpacesMapping = charts.map((c, i) => ({
                id: c.saved_query_id,
                newId: newCharts[i].saved_query_id,
            }));
            const chartInDashboardsMapping = chartsInDashboards.map((c, i) => ({
                id: c.saved_query_id,
                newId: newChartsInDashboards[i].saved_query_id,
            }));

            const chartMapping = [
                ...chartInSpacesMapping,
                ...chartInDashboardsMapping,
            ];

            const chartIds = chartMapping.map((c) => c.id);

            // only get last chart version
            const lastVersionIds = await trx('saved_queries_versions')
                .whereIn('saved_query_id', chartIds)
                .groupBy('saved_query_id')
                .max('saved_queries_version_id');

            const chartVersions = await trx('saved_queries_versions')
                .whereIn(
                    'saved_queries_version_id',
                    lastVersionIds.map((d) => d.max),
                )
                .select('*');

            const chartVersionIds = chartVersions.map(
                (d) => d.saved_queries_version_id,
            );

            const newChartVersions =
                chartVersions.length > 0
                    ? await trx('saved_queries_versions')
                          .insert(
                              chartVersions.map((d) => {
                                  const newSavedQueryId = chartMapping.find(
                                      (m) => m.id === d.saved_query_id,
                                  )?.newId;
                                  if (!newSavedQueryId) {
                                      throw new Error(
                                          `Cannot find new chart id for ${d.saved_query_id}`,
                                      );
                                  }
                                  const createChartVersion = {
                                      ...d,
                                      saved_queries_version_id: undefined,
                                      saved_queries_version_uuid: undefined,
                                      saved_query_id: newSavedQueryId,
                                  };
                                  delete createChartVersion.saved_queries_version_id;
                                  delete createChartVersion.saved_queries_version_uuid;

                                  return createChartVersion;
                              }),
                          )
                          .returning('*')
                    : [];

            const chartVersionMapping = chartVersions.map((c, i) => ({
                id: c.saved_queries_version_id,
                newId: newChartVersions[i].saved_queries_version_id,
            }));

            const copyChartVersionContent = async (
                table: string,
                excludedFields: string[],
                fieldPreprocess: { [field: string]: (value: any) => any } = {},
            ) => {
                const content = await trx(table)
                    .whereIn('saved_queries_version_id', chartVersionIds)
                    .select(`*`);

                if (content.length === 0) return undefined;

                const newContent = await trx(table)
                    .insert(
                        content.map((d) => {
                            const createContent = {
                                ...d,
                                saved_queries_version_id:
                                    chartVersionMapping.find(
                                        (m) =>
                                            m.id === d.saved_queries_version_id,
                                    )?.newId,
                            };
                            excludedFields.forEach((fieldId) => {
                                delete createContent[fieldId];
                            });
                            Object.keys(fieldPreprocess).forEach((fieldId) => {
                                createContent[fieldId] = fieldPreprocess[
                                    fieldId
                                ](createContent[fieldId]);
                            });
                            return createContent;
                        }),
                    )
                    .returning('*');

                return newContent;
            };

            await copyChartVersionContent(
                'saved_queries_version_table_calculations',
                ['saved_queries_version_table_calculation_id'],
            );
            await copyChartVersionContent(
                'saved_queries_version_custom_dimensions',
                ['saved_queries_version_custom_dimension_id'],
                { custom_range: (value: any) => JSON.stringify(value) },
            );
            await copyChartVersionContent(
                SavedChartCustomSqlDimensionsTableName,
                [],
            );
            await copyChartVersionContent('saved_queries_version_sorts', [
                'saved_queries_version_sort_id',
            ]);
            await copyChartVersionContent('saved_queries_version_fields', [
                'saved_queries_version_field_id',
            ]);
            await copyChartVersionContent(
                'saved_queries_version_additional_metrics',
                ['saved_queries_version_additional_metric_id', 'uuid'],
                { filters: (value: any) => JSON.stringify(value) },
            );

            const dashboards = await trx('dashboards')
                .leftJoin('spaces', 'dashboards.space_id', 'spaces.space_id')
                .whereIn('dashboards.space_id', spaceIds)
                .andWhere('spaces.project_id', projectId)
                .select<DbDashboard[]>('dashboards.*');

            const dashboardIds = dashboards.map((d) => d.dashboard_id);

            Logger.info(
                `Duplicating ${dashboards.length} dashboards on ${previewProjectUuid}`,
            );

            const newDashboards =
                dashboards.length > 0
                    ? await trx('dashboards')
                          .insert(
                              dashboards.map((d) => {
                                  type CloneDashboard = Omit<
                                      DbDashboard,
                                      | 'dashboard_id'
                                      | 'dashboard_uuid'
                                      | 'search_vector'
                                  > & {
                                      search_vector?: string;
                                      dashboard_id?: number;
                                      dashboard_uuid?: string;
                                  };
                                  const createDashboard: CloneDashboard = {
                                      ...d,
                                      search_vector: undefined,
                                      dashboard_id: undefined,
                                      dashboard_uuid: undefined,
                                      space_id: getNewSpaceId(d.space_id),
                                  };
                                  delete createDashboard.search_vector;
                                  delete createDashboard.dashboard_id;
                                  delete createDashboard.dashboard_uuid;
                                  return createDashboard;
                              }),
                          )
                          .returning('*')
                    : [];

            const dashboardMapping = dashboards.map((c, i) => ({
                id: c.dashboard_id,
                newId: newDashboards[i].dashboard_id,
                uuid: c.dashboard_uuid,
                newUuid: newDashboards[i].dashboard_uuid,
            }));

            // Get last version of a dashboard
            const lastDashboardVersionsIds = await trx('dashboard_versions')
                .whereIn('dashboard_id', dashboardIds)
                .groupBy('dashboard_id')
                .max('dashboard_version_id');

            const dashboardVersionIds = lastDashboardVersionsIds.map(
                (d) => d.max,
            );

            const dashboardVersions = await trx('dashboard_versions')
                .whereIn('dashboard_version_id', dashboardVersionIds)
                .select('*');

            const newDashboardVersions =
                dashboardVersions.length > 0
                    ? await trx('dashboard_versions')
                          .insert(
                              dashboardVersions.map((d) => {
                                  const createDashboardVersion = {
                                      ...d,
                                      dashboard_version_id: undefined,
                                      dashboard_id: dashboardMapping.find(
                                          (m) => m.id === d.dashboard_id,
                                      )?.newId!,
                                  };
                                  delete createDashboardVersion.dashboard_version_id;
                                  return createDashboardVersion;
                              }),
                          )
                          .returning('*')
                    : [];

            const dashboardVersionsMapping = dashboardVersions.map((c, i) => ({
                id: c.dashboard_version_id,
                newId: newDashboardVersions[i].dashboard_version_id,
            }));

            const dashboardViews = await trx(DashboardViewsTableName).whereIn(
                'dashboard_version_id',
                dashboardVersionIds,
            );

            Logger.info(
                `Duplicating ${dashboardViews.length} dashboard views on ${previewProjectUuid}`,
            );

            if (dashboardViews.length > 0) {
                await trx(DashboardViewsTableName).insert(
                    dashboardViews.map((d) => ({
                        ...d,
                        dashboard_view_uuid: undefined,
                        dashboard_version_id: dashboardVersionsMapping.find(
                            (m) => m.id === d.dashboard_version_id,
                        )?.newId!,
                    })),
                );
            }

            const dashboardTiles = await trx('dashboard_tiles').whereIn(
                'dashboard_version_id',
                dashboardVersionIds,
            );

            Logger.info(
                `Duplicating ${dashboardTiles.length} dashboard tiles on ${previewProjectUuid}`,
            );

            const dashboardTileUuids = dashboardTiles.map(
                (dv) => dv.dashboard_tile_uuid,
            );

            Logger.info(
                `Updating ${chartsInDashboards.length} charts in dashboards`,
            );
            // Update chart in dashboards with new dashboardUuids
            const updateChartInDashboards = newChartsInDashboards.map(
                (chart) => {
                    const newDashboardUuid = dashboardMapping.find(
                        (m) => m.uuid === chart.dashboard_uuid,
                    )?.newUuid;

                    if (!newDashboardUuid) {
                        // The dashboard was not copied, perhaps becuase it belongs to a space the user doesn't have access to
                        // We delete this chart in dashboard
                        return trx('saved_queries')
                            .where('saved_query_id', chart.saved_query_id)
                            .delete();
                    }
                    return trx('saved_queries')
                        .update({
                            dashboard_uuid: newDashboardUuid,
                        })
                        .where('saved_query_id', chart.saved_query_id);
                },
            );
            await Promise.all(updateChartInDashboards);

            const newDashboardTiles =
                dashboardTiles.length > 0
                    ? await trx('dashboard_tiles')
                          .insert(
                              dashboardTiles.map((d) => ({
                                  ...d,
                                  // we keep the same dashboard_tile_uuid
                                  dashboard_version_id:
                                      dashboardVersionsMapping.find(
                                          (m) =>
                                              m.id === d.dashboard_version_id,
                                      )?.newId!,
                              })),
                          )
                          .returning('*')
                    : [];

            const dashboardTilesMapping = dashboardTiles.map((c, i) => ({
                id: c.dashboard_tile_uuid,
                newId: newDashboardTiles[i].dashboard_tile_uuid,
            }));

            const copyDashboardTileContent = async (table: string) => {
                const content = await trx(table)
                    .whereIn('dashboard_tile_uuid', dashboardTileUuids)
                    .and.whereIn('dashboard_version_id', dashboardVersionIds);

                if (content.length === 0) return undefined;

                const newContent = await trx(table).insert(
                    content.map((d) => ({
                        ...d,

                        // only applied to tile charts
                        ...(d.saved_chart_id && {
                            saved_chart_id: chartMapping.find(
                                (c) => c.id === d.saved_chart_id,
                            )?.newId,
                        }),

                        dashboard_version_id: dashboardVersionsMapping.find(
                            (m) => m.id === d.dashboard_version_id,
                        )?.newId!,
                        dashboard_tile_uuid: dashboardTilesMapping.find(
                            (m) => m.id === d.dashboard_tile_uuid,
                        )?.newId!,
                    })),
                );
                return newContent;
            };

            await copyDashboardTileContent('dashboard_tile_charts');
            await copyDashboardTileContent('dashboard_tile_looms');
            await copyDashboardTileContent('dashboard_tile_markdowns');

            const contentMapping: PreviewContentMapping = {
                charts: chartMapping,
                chartVersions: chartVersionMapping,
                spaces: spaceMapping,
                dashboards: dashboardMapping,
                dashboardVersions: dashboardVersionsMapping,
            };
            // Insert mapping on database
            await trx('preview_content').insert({
                project_uuid: projectUuid,
                preview_project_uuid: previewProjectUuid,
                content_mapping: contentMapping,
            });
        });
    }

    // Easier to mock in ProjectService
    // eslint-disable-next-line class-methods-use-this
    getWarehouseClientFromCredentials(credentials: CreateWarehouseCredentials) {
        return warehouseClientFromCredentials(credentials);
    }
}
