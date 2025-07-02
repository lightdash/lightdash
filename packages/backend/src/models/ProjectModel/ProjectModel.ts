import {
    AlreadyExistsError,
    AnyType,
    BigqueryAuthenticationType,
    CreateProject,
    CreateProjectOptionalCredentials,
    CreateSnowflakeCredentials,
    CreateVirtualViewPayload,
    CreateWarehouseCredentials,
    DbtProjectConfig,
    Explore,
    ExploreError,
    ExploreType,
    NotExistsError,
    NotFoundError,
    OrganizationProject,
    ParameterError,
    PreviewContentMapping,
    Project,
    ProjectGroupAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectSummary,
    ProjectType,
    SnowflakeAuthenticationType,
    SpaceSummary,
    SupportedDbtVersions,
    TablesConfiguration,
    UnexpectedServerError,
    UpdateMetadata,
    UpdateProject,
    UpdateVirtualViewPayload,
    WarehouseClient,
    WarehouseCredentials,
    WarehouseTypes,
    assertUnreachable,
    createVirtualView,
    getLtreePathFromSlug,
    isExploreError,
    sensitiveCredentialsFieldNames,
    sensitiveDbtCredentialsFieldNames,
} from '@lightdash/common';
import {
    WarehouseCatalog,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { Knex } from 'knex';
import { merge } from 'lodash';
import { DatabaseError } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../../config/parseConfig';
import {
    DashboardTabsTableName,
    DashboardViewsTableName,
    DbDashboard,
    DbDashboardTabs,
} from '../../database/entities/dashboards';
import { GroupMembershipTableName } from '../../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../../database/entities/organizations';
import { PinnedListTableName } from '../../database/entities/pinnedList';
import { ProjectGroupAccessTableName } from '../../database/entities/projectGroupAccess';
import {
    DbProjectMembership,
    ProjectMembershipsTableName,
} from '../../database/entities/projectMemberships';
import {
    CachedExploreTableName,
    CachedExploresTableName,
    CachedWarehouseTableName,
    DbCachedWarehouse,
    DbProject,
    ProjectTableName,
    type DbCachedExplore,
} from '../../database/entities/projects';
import {
    DbSavedChart,
    InsertChart,
    SavedChartCustomSqlDimensionsTableName,
} from '../../database/entities/savedCharts';
import { DbSavedSql, InsertSql } from '../../database/entities/savedSql';
import { DbSpace, SpaceTableName } from '../../database/entities/spaces';
import { DbUser } from '../../database/entities/users';
import { WarehouseCredentialTableName } from '../../database/entities/warehouseCredentials';
import Logger from '../../logging/logger';
import { wrapSentryTransaction } from '../../utils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { generateUniqueSpaceSlug } from '../../utils/SlugUtils';
import { ExploreCache } from './ExploreCache';
import Transaction = Knex.Transaction;

export type ProjectModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
    encryptionUtil: EncryptionUtil;
};

const CACHED_EXPLORES_PG_LOCK_NAMESPACE = 1;

export class ProjectModel {
    protected database: Knex;

    protected lightdashConfig: LightdashConfig;

    private encryptionUtil: EncryptionUtil;

    private readonly exploreCache: ExploreCache;

    constructor(args: ProjectModelArguments) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
        this.encryptionUtil = args.encryptionUtil;
        this.exploreCache = new ExploreCache();
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
                    !(incompleteConfig as AnyType)[secretKey] &&
                    (completeConfig as AnyType)[secretKey]
                        ? {
                              ...sum,
                              [secretKey]: (completeConfig as AnyType)[
                                  secretKey
                              ],
                          }
                        : sum,
                {},
            ),
        };
    }

    static mergeMissingWarehouseSecrets<
        T extends CreateWarehouseCredentials = CreateWarehouseCredentials,
    >(incompleteConfig: T, completeConfig: CreateWarehouseCredentials): T {
        if (
            incompleteConfig.type !== completeConfig.type ||
            // BigQuery ADC authentication does not require credentials to be set
            (incompleteConfig.type === WarehouseTypes.BIGQUERY &&
                incompleteConfig.authenticationType ===
                    BigqueryAuthenticationType.ADC)
        ) {
            return incompleteConfig;
        }
        return {
            ...incompleteConfig,
            ...sensitiveCredentialsFieldNames.reduce((sum, secretKey) => {
                const newConfigSecretValue = (incompleteConfig as AnyType)[
                    secretKey
                ];
                const isSecretMissingInNewConfig =
                    newConfigSecretValue === undefined ||
                    newConfigSecretValue === ''; // Null values are not considered missing
                const isSecretPresentInSavedConfig = !!(
                    completeConfig as AnyType
                )[secretKey];
                if (
                    isSecretMissingInNewConfig &&
                    isSecretPresentInSavedConfig
                ) {
                    // merge missing secret
                    return {
                        ...sum,
                        [secretKey]: (completeConfig as AnyType)[secretKey],
                    };
                }
                return sum;
            }, {}),
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

        const organizationId = orgs[0].organization_id;

        const projects = await this.database
            .with('agg_project_group_access_counts', (q) => {
                void q
                    .select(
                        'projects.project_uuid',
                        this.database.raw(
                            `COUNT(distinct ${GroupMembershipTableName}.user_id) as member_count`,
                        ),
                    )
                    .from(ProjectGroupAccessTableName)
                    .groupBy('projects.project_uuid')
                    .leftJoin(
                        'projects',
                        'projects.project_uuid',
                        `${ProjectGroupAccessTableName}.project_uuid`,
                    )
                    .leftJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${ProjectGroupAccessTableName}.group_uuid`,
                    )
                    .where('projects.organization_id', organizationId);
            })
            .with('agg_project_membership_counts', (q) => {
                void q
                    .select(
                        'projects.project_uuid',
                        this.database.raw(
                            `COUNT(distinct ${ProjectMembershipsTableName}.user_id) as member_count`,
                        ),
                    )
                    .from(ProjectMembershipsTableName)
                    .groupBy('projects.project_uuid')
                    .leftJoin(
                        'projects',
                        'projects.project_id',
                        `${ProjectMembershipsTableName}.project_id`,
                    )
                    .where('projects.organization_id', organizationId);
            })
            .from('projects')
            .leftJoin(
                WarehouseCredentialTableName,
                'projects.project_id',
                `${WarehouseCredentialTableName}.project_id`,
            )
            .select(
                'projects.project_uuid',
                'projects.name',
                'projects.project_type',
                `projects.copied_from_project_uuid`,
                `projects.created_by_user_uuid`,
                `${WarehouseCredentialTableName}.warehouse_type`,
                `${WarehouseCredentialTableName}.encrypted_credentials`,
                this.database.raw(
                    '(agg_project_group_access_counts.member_count + agg_project_membership_counts.member_count) as member_count',
                ),
            )
            .leftJoin(
                'agg_project_group_access_counts',
                'projects.project_uuid',
                'agg_project_group_access_counts.project_uuid',
            )
            .leftJoin(
                'agg_project_membership_counts',
                'projects.project_uuid',
                'agg_project_membership_counts.project_uuid',
            )
            .where('organization_id', organizationId)
            .orderByRaw(
                `
                    CASE
                        WHEN projects.project_type = 'DEFAULT' THEN 0
                        ELSE 1
                    END,
                    member_count DESC,
                    projects.created_at ASC
                `,
            );

        return projects.map<OrganizationProject>(
            ({
                name,
                project_uuid,
                project_type,
                created_by_user_uuid,
                copied_from_project_uuid,
                warehouse_type,
                encrypted_credentials,
            }) => {
                try {
                    const warehouseCredentials =
                        encrypted_credentials !== null
                            ? (JSON.parse(
                                  this.encryptionUtil.decrypt(
                                      encrypted_credentials,
                                  ),
                              ) as CreateWarehouseCredentials)
                            : undefined;
                    return {
                        name,
                        projectUuid: project_uuid,
                        type: project_type,
                        createdByUserUuid: created_by_user_uuid,
                        upstreamProjectUuid: copied_from_project_uuid,
                        warehouseType:
                            warehouse_type !== null
                                ? (warehouse_type as WarehouseTypes)
                                : undefined,
                        requireUserCredentials:
                            !!warehouseCredentials?.requireUserCredentials,
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

    async hasAnyProjects(): Promise<boolean> {
        const results = await this.database('projects')
            .count('project_uuid as count')
            .first<{ count: string }>();
        return parseInt(results.count, 10) > 0;
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
        userUuid: string,
        organizationUuid: string,
        data: CreateProject,
    ): Promise<string> {
        return this.createWithOptionalCredentials(
            userUuid,
            organizationUuid,
            data,
        );
    }

    async createWithOptionalCredentials(
        userUuid: string,
        organizationUuid: string,
        data: CreateProjectOptionalCredentials,
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
                    ...(copiedProjects.length === 1
                        ? {
                              scheduler_timezone:
                                  copiedProjects[0].scheduler_timezone,
                          }
                        : {}),
                    created_by_user_uuid: userUuid,
                })
                .returning('*');

            if (data.warehouseConnection) {
                await this.upsertWarehouseConnection(
                    trx,
                    project.project_id,
                    data.warehouseConnection,
                );
            }

            if (data.type !== ProjectType.PREVIEW) {
                const slug = await generateUniqueSpaceSlug(
                    'Shared',
                    project.project_id,
                    {
                        trx,
                    },
                );

                const path = getLtreePathFromSlug(slug);

                await trx(SpaceTableName).insert({
                    project_id: project.project_id,
                    name: 'Shared',
                    is_private: false,
                    slug,
                    parent_space_uuid: null,
                    path,
                });
            }

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
        await this.database.transaction(async (trx) => {
            const [project] = await trx('projects')
                .select('project_id')
                .where('project_uuid', projectUuid);

            if (!project) {
                throw new NotFoundError('Project not found');
            }
            const projectId = project.project_id;
            // First we delete some of the content from the project
            // to avoid getting deadlock issues
            await trx('catalog_search')
                .where('project_uuid', projectUuid)
                .delete();

            await trx('cached_explores')
                .where('project_uuid', projectUuid)
                .delete();

            await trx('cached_explore')
                .where('project_uuid', projectUuid)
                .delete();

            // Deleting spaces will also delete dashboards and charts in cascade,
            // At the same time, charts and dashboards will delete analytic_views, schedulers, pinned content, and more.
            await trx('spaces').where('project_id', projectId).delete();

            await trx('jobs').where('project_uuid', projectUuid).delete();

            // Finally, delete the project and everything else in cascade
            await trx('projects').where('project_uuid', projectUuid).delete();
        });
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
                  scheduler_timezone: string;
                  created_by_user_uuid: string | null;
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
                  scheduler_timezone: string;
                  created_by_user_uuid: string | null;
              }
        )[];
        return wrapSentryTransaction(
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
                        this.database
                            .ref('scheduler_timezone')
                            .withSchema(ProjectTableName),
                        this.database
                            .ref('created_by_user_uuid')
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
                    schedulerTimezone: project.scheduler_timezone,
                    createdByUserUuid: project.created_by_user_uuid,
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
                `${ProjectTableName}.project_type`,
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

    /* 
    This method will load default values for backwards compatibility
    For example, when we introduce a new authentication type, we need to set the default value for the existing projects
    */
    static getConnectionWithDefaults(
        sensitiveCredentials?: CreateWarehouseCredentials,
        nonSensitiveCredentials?: WarehouseCredentials,
    ): WarehouseCredentials | undefined {
        if (!sensitiveCredentials || !nonSensitiveCredentials) {
            return nonSensitiveCredentials;
        }

        switch (nonSensitiveCredentials.type) {
            case WarehouseTypes.BIGQUERY:
                return {
                    ...nonSensitiveCredentials,
                    authenticationType:
                        nonSensitiveCredentials.authenticationType ??
                        BigqueryAuthenticationType.PRIVATE_KEY,
                };
            case WarehouseTypes.SNOWFLAKE: {
                const rawCredentials =
                    sensitiveCredentials as CreateSnowflakeCredentials;

                if (nonSensitiveCredentials.authenticationType !== undefined) {
                    return nonSensitiveCredentials;
                }

                if (rawCredentials.privateKey === undefined) {
                    return {
                        ...nonSensitiveCredentials,
                        authenticationType:
                            SnowflakeAuthenticationType.PASSWORD,
                    };
                }

                return {
                    ...nonSensitiveCredentials,
                    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                };
            }
            default:
                return nonSensitiveCredentials;
        }
    }

    async get(projectUuid: string): Promise<Project> {
        const project = await this.getWithSensitiveFields(projectUuid);
        const sensitiveCredentials = project.warehouseConnection;

        const nonSensitiveDbtCredentials = Object.fromEntries(
            Object.entries(project.dbtConnection).filter(
                ([key]) =>
                    !sensitiveDbtCredentialsFieldNames.includes(key as AnyType),
            ),
        ) as DbtProjectConfig;

        const nonSensitiveCredentials = sensitiveCredentials
            ? (Object.fromEntries(
                  Object.entries(sensitiveCredentials).filter(
                      ([key]) =>
                          !sensitiveCredentialsFieldNames.includes(
                              key as AnyType,
                          ),
                  ),
              ) as WarehouseCredentials)
            : undefined;

        const nonSensitiveCredentialsWithDefaults =
            ProjectModel.getConnectionWithDefaults(
                sensitiveCredentials,
                nonSensitiveCredentials,
            );

        return {
            organizationUuid: project.organizationUuid,
            projectUuid,
            name: project.name,
            type: project.type,
            dbtConnection: nonSensitiveDbtCredentials,
            warehouseConnection: nonSensitiveCredentialsWithDefaults,
            pinnedListUuid: project.pinnedListUuid,
            dbtVersion: project.dbtVersion,
            upstreamProjectUuid: project.upstreamProjectUuid || undefined,
            schedulerTimezone: project.schedulerTimezone,
            createdByUserUuid: project.createdByUserUuid ?? null,
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

    async findExploresFromCache(
        projectUuid: string,
        exploreNamesWithDuplicates?: string[],
    ): Promise<Record<string, Explore | ExploreError>> {
        // dedupe values
        const exploreNames = exploreNamesWithDuplicates
            ? [...new Set(exploreNamesWithDuplicates)]
            : undefined;
        return wrapSentryTransaction(
            'ProjectModel.findExploresFromCache',
            {
                projectUuid,
                exploreNames,
            },
            async (span) => {
                // Try to get from cache first
                const cachedExplores = this.exploreCache?.getExplores(
                    projectUuid,
                    exploreNames,
                );
                if (cachedExplores) {
                    span.setAttribute('cacheHit', true);
                    // Return cached explores
                    return cachedExplores;
                }
                // If not in cache, get from database
                const query = this.database(CachedExploreTableName)
                    .select('explore')
                    .where('project_uuid', projectUuid);
                if (exploreNames) {
                    void query.whereIn('name', exploreNames);
                }
                const explores = await query;
                span.setAttribute('foundExplores', !!explores.length);
                const finalExplores = explores.reduce<
                    Record<string, Explore | ExploreError>
                >((acc, { explore }) => {
                    acc[explore.name] =
                        ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                            explore,
                        );
                    return acc;
                }, {});
                // Store in cache
                this.exploreCache?.setExplores(
                    projectUuid,
                    exploreNames,
                    finalExplores,
                );
                return finalExplores;
            },
        );
    }

    async getAllExploresFromCache(
        projectUuid: string,
    ): Promise<{ [exploreUuid: string]: Explore | ExploreError }> {
        const cachedExplores = await this.database(CachedExploreTableName)
            .select<
                {
                    cached_explore_uuid: string;
                    explore: Explore | ExploreError;
                }[]
            >(['explore', 'cached_explore_uuid'])
            .where('project_uuid', projectUuid);

        return cachedExplores.reduce<Record<string, Explore | ExploreError>>(
            (acc, { cached_explore_uuid, explore }) => {
                acc[cached_explore_uuid] = explore;
                return acc;
            },
            {},
        );
    }

    async getExploreFromCache(
        projectUuid: string,
        exploreName: string,
    ): Promise<Explore | ExploreError> {
        const cachedExplores = await this.findExploresFromCache(projectUuid, [
            exploreName,
        ]);
        const cachedExplore = cachedExplores[exploreName];
        if (cachedExplore === undefined) {
            throw new NotExistsError(
                `Explore "${exploreName}" does not exist.`,
            );
        }
        return cachedExplore;
    }

    async findExploreByTableName(
        projectUuid: string,
        tableName: string,
    ): Promise<Explore | ExploreError | undefined> {
        const cachedExplores = await this.findExploresFromCache(projectUuid, [
            tableName,
        ]);
        return cachedExplores[tableName];
    }

    // Returns explore based on the join original name rather than the explore with the join.
    async findJoinAliasExplore(
        projectUuid: string,
        joinAliasName: string,
    ): Promise<Explore | ExploreError | undefined> {
        return wrapSentryTransaction(
            'ProjectModel.findExploreFromJoinAlias',
            {},
            async (span) => {
                const exploreWithJoinAlias = await this.database(
                    CachedExploreTableName,
                )
                    .columns({
                        explore: 'explore',
                        baseMatch: this.database.raw(
                            "? = explore->>'baseTable'",
                            [joinAliasName],
                        ),
                    })
                    .select<{
                        explore: Explore | ExploreError;
                        baseMatch: boolean;
                    }>()
                    .whereRaw('? = ANY(table_names)', joinAliasName)
                    .andWhere('project_uuid', projectUuid)
                    .orderBy('baseMatch', 'desc')
                    .first();
                if (exploreWithJoinAlias) {
                    const originalTableName =
                        exploreWithJoinAlias.explore.tables?.[joinAliasName]
                            .originalName;
                    if (originalTableName) {
                        const exploreCache = await this.database(
                            CachedExploreTableName,
                        )
                            .select('explore')
                            .where('name', originalTableName)
                            .andWhere('project_uuid', projectUuid)
                            .first();
                        span.setAttribute(
                            'foundExploreCacheViaJoinAlias',
                            !!exploreCache,
                        );
                        return exploreCache
                            ? ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                                  exploreCache.explore,
                              )
                            : undefined;
                    }
                }

                return undefined;
            },
        );
    }

    async saveExploresToCache(
        projectUuid: string,
        explores: (Explore | ExploreError)[],
    ) {
        return wrapSentryTransaction(
            'ProjectModel.saveExploresToCache',
            {},
            async () =>
                this.database.transaction(async (trx) => {
                    // Get custom explores/virtual views before deleting them
                    const virtualViews = await trx(CachedExploreTableName)
                        .select('explore')
                        .where('project_uuid', projectUuid)
                        .whereRaw("explore->>'type' = ?", [
                            ExploreType.VIRTUAL,
                        ]);

                    // Delete previous individually cached explores
                    await trx(CachedExploreTableName)
                        .where('project_uuid', projectUuid)
                        .delete();

                    // NOTE: virtual views with the same name as explores will override the explore.
                    // This isn't new behavior, but it's still a bit of a bug. However, it's
                    // not clear what a better approach would be at the moment.
                    const exploresMap = new Map(
                        explores.map((e) => [e.name, e]),
                    );
                    virtualViews.forEach((e) =>
                        exploresMap.set(e.explore.name, e.explore),
                    );
                    const uniqueExplores = Array.from(exploresMap.values());

                    if (uniqueExplores.length <= 0) {
                        throw new ParameterError('No explores to save');
                    }

                    // Cache explores individually
                    const individualCachedExplores = await trx
                        .batchInsert<DbCachedExplore>(
                            CachedExploreTableName,
                            uniqueExplores.map((explore) => ({
                                project_uuid: projectUuid,
                                name: explore.name,
                                table_names: Object.keys(explore.tables || {}),
                                explore: JSON.stringify(explore),
                            })),
                        )
                        .returning('cached_explore_uuid');

                    // Cache explores together
                    await trx(CachedExploresTableName)
                        .insert({
                            project_uuid: projectUuid,
                            explores: JSON.stringify(uniqueExplores),
                        })
                        .onConflict('project_uuid')
                        .merge()
                        .returning('*');

                    return {
                        cachedExploreUuids: individualCachedExplores.map(
                            (explore) => explore.cached_explore_uuid,
                        ),
                    };
                }),
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
        } catch (error: AnyType) {
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

    async getWarehouseCredentialsForProject(
        projectUuid: string,
        refreshToken?: string, // TODO make this a fucntion to get the refresh token for the user, and use it if bigquery
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
                                      parent_space_uuid: null,
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

            // fix parent_space_uuid based on path for the spaces
            await trx.raw(
                `
                UPDATE spaces AS child
                SET parent_space_uuid = parent.space_uuid
                FROM spaces AS parent
                WHERE
                    child.project_id = ?
                    AND parent.project_id = ?
                    AND subpath(child.path, 0, nlevel(child.path) - 1) = parent.path
                    AND nlevel(child.path) > 1;`,
                [previewProject.project_id, previewProject.project_id],
            );

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

            const spaceGroupAccesses = await trx('space_group_access').whereIn(
                'space_uuid',
                spaceUuids,
            );

            Logger.info(
                `Duplicating ${spaceGroupAccesses.length} space group accesses on ${previewProjectUuid}`,
            );

            const newSpaceGroupAccesses =
                spaceGroupAccesses.length > 0
                    ? await trx('space_group_access')
                          .insert(
                              spaceGroupAccesses.map((d) => ({
                                  ...d,
                                  space_uuid: getNewSpaceUuid(d.space_uuid),
                              })),
                          )
                          .returning('*')
                    : [];

            const virtualViews = await trx(CachedExploreTableName)
                .where('project_uuid', projectUuid)
                .andWhereJsonPath(
                    'explore',
                    '$.type',
                    '=',
                    ExploreType.VIRTUAL,
                );

            if (virtualViews.length > 0) {
                Logger.info(
                    `Duplicating ${virtualViews.length} virtual views into ${previewProjectUuid}`,
                );

                await trx(CachedExploreTableName).insert(
                    virtualViews.map((v) => ({
                        ...v,
                        project_uuid: previewProjectUuid,
                        cached_explore_uuid: undefined,
                    })),
                );
            }

            // .dP"Y8    db    Yb    dP 888888 8888b.      .dP"Y8  dP"Yb  88
            // `Ybo."   dPYb    Yb  dP  88__    8I  Yb     `Ybo." dP   Yb 88
            // o.`Y8b  dP__Yb    YbdP   88""    8I  dY     o.`Y8b Yb b dP 88  .o
            // 8bodP' dP""""Yb    YP    888888 8888Y"      8bodP'  `"YoYo 88ood8

            // Get all the saved SQLs
            const savedSQLs = await trx('saved_sql')
                .leftJoin('spaces', 'saved_sql.space_uuid', 'spaces.space_uuid')
                .whereIn('saved_sql.space_uuid', spaceUuids)
                .andWhere('spaces.project_id', projectId)
                .select<DbSavedSql[]>('saved_sql.*');

            Logger.info(
                `Duplicating ${savedSQLs.length} SQL queries on ${previewProjectUuid}`,
            );

            // Define the type for the new saved SQLs
            type CloneSavedSQL = InsertSql & {
                saved_sql_uuid?: string;
                search_vector?: string;
            };

            // Create a function to create the saved SQLs
            const createSavedSQLs = async (savedSQLList: DbSavedSql[]) => {
                if (savedSQLList.length === 0) {
                    return [];
                }
                // Create an array of promises for generating slugs and mapping saved SQLs
                const mappedSavedSQLsPromises = savedSQLList.map(async (d) => {
                    if (!d.space_uuid) {
                        throw new Error(
                            `Chart ${d.saved_sql_uuid} has no space_uuid`,
                        );
                    }
                    // Generate the slug asynchronously
                    // const uniqueSlug = await generateUniqueSlug(
                    //     trx,
                    //     'saved_sql',
                    //     d.slug, // using the existing slug as a base - preventing naming duplicates
                    // );
                    // Map the saved SQL to the new saved SQL
                    const createSavedSQL: CloneSavedSQL = {
                        ...d,
                        project_uuid: previewProjectUuid,
                        space_uuid: getNewSpaceUuid(d.space_uuid),
                        // slug: uniqueSlug,
                        search_vector: undefined,
                        saved_sql_uuid: undefined,
                        dashboard_uuid: null,
                    };
                    delete createSavedSQL.search_vector;
                    delete createSavedSQL.saved_sql_uuid;
                    return createSavedSQL;
                });
                // Resolve all promises
                const mappedSavedSQLs = await Promise.all(
                    mappedSavedSQLsPromises,
                );
                // Insert all the saved SQLs after they have been mapped and return the result
                const newSavedSQLs = await trx('saved_sql')
                    .insert(mappedSavedSQLs)
                    .returning('*');
                return newSavedSQLs;
            };

            // Create the saved SQLs
            const newSavedSQLs = await createSavedSQLs(savedSQLs);

            // Create a mapping of the old saved SQLs to the new saved SQLs
            const savedSQLInDashboards = await trx('saved_sql')
                .leftJoin(
                    'dashboards',
                    'saved_sql.dashboard_uuid',
                    'dashboards.dashboard_uuid',
                )
                .leftJoin('spaces', 'dashboards.space_id', 'spaces.space_id')
                .where('spaces.project_id', projectId)
                .andWhere('saved_sql.space_uuid', null)
                .select<DbSavedSql[]>('saved_sql.*');

            Logger.info(
                `Duplicating ${savedSQLInDashboards.length} charts in dashboards on ${previewProjectUuid}`,
            );

            // Create the saved SQLs in the dashboards
            const newSavedSQLInDashboards =
                savedSQLInDashboards.length > 0
                    ? await trx('saved_sql')
                          .insert(
                              savedSQLInDashboards.map((d) => {
                                  if (!d.dashboard_uuid) {
                                      throw new Error(
                                          `Chart ${d.saved_sql_uuid} has no dashboard_uuid`,
                                      );
                                  }
                                  const createSavedSQL: CloneSavedSQL = {
                                      ...d,
                                      dashboard_uuid: d.dashboard_uuid,
                                      search_vector: undefined,
                                      saved_sql_uuid: undefined,
                                      space_uuid: null,
                                  };
                                  delete createSavedSQL.search_vector;
                                  delete createSavedSQL.saved_sql_uuid;
                                  return createSavedSQL;
                              }),
                          )
                          .returning('*')
                    : [];

            // Create a mapping of the old saved SQLs to the new saved SQLs
            const savedSQLInSpacesMapping = savedSQLs.map((c, i) => ({
                id: c.saved_sql_uuid,
                newId: newSavedSQLs[i].saved_sql_uuid,
            }));
            const savedSQLInDashboardsMapping = savedSQLInDashboards.map(
                (c, i) => ({
                    id: c.saved_sql_uuid,
                    newId: newSavedSQLInDashboards[i].saved_sql_uuid,
                }),
            );
            const savedSQLMapping = [
                ...savedSQLInSpacesMapping,
                ...savedSQLInDashboardsMapping,
            ];

            const savedSQLUuids = savedSQLMapping.map((c) => c.id);

            // Get the last saved SQL version by uuid and created_at
            const lastSavedSQLVersionEntries = await trx('saved_sql_versions')
                .whereIn('saved_sql_uuid', savedSQLUuids)
                .select('saved_sql_uuid')
                .max('created_at as latest_created_at')
                .groupBy('saved_sql_uuid');

            // Now query the full records for each saved_sql_uuid where created_at is the latest
            const savedSQLVersions = await trx('saved_sql_versions')
                .whereIn(
                    'saved_sql_uuid',
                    lastSavedSQLVersionEntries.map((d) => d.saved_sql_uuid),
                )
                .select('*');

            const newSavedSQLVersions =
                savedSQLVersions.length > 0
                    ? await trx('saved_sql_versions')
                          .insert(
                              savedSQLVersions.map((d) => {
                                  const newSavedSQLUuid = savedSQLMapping.find(
                                      (m) => m.id === d.saved_sql_uuid,
                                  )?.newId;
                                  if (!newSavedSQLUuid) {
                                      throw new Error(
                                          `Cannot find new saved SQL uuid for ${d.saved_sql_uuid}`,
                                      );
                                  }
                                  const createSavedSQLVersion = {
                                      ...d,
                                      saved_sql_version_uuid: undefined,
                                      saved_sql_uuid: newSavedSQLUuid,
                                  };
                                  delete createSavedSQLVersion.saved_sql_version_uuid;
                                  return createSavedSQLVersion;
                              }),
                          )
                          .returning('*')
                    : [];

            const savedSQLVersionMapping = savedSQLVersions.map((c, i) => ({
                id: c.saved_sql_version_uuid,
                newId: newSavedSQLVersions[i].saved_sql_version_uuid,
            }));

            //  dP""b8 88  88    db    88""Yb 888888 .dP"Y8
            // dP   `" 88  88   dPYb   88__dP   88   `Ybo."
            // Yb      888888  dP__Yb  88"Yb    88   o.`Y8b
            //  YboodP 88  88 dP""""Yb 88  Yb   88   8bodP'
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
                fieldPreprocess: {
                    [field: string]: (value: AnyType) => AnyType;
                } = {},
            ) => {
                const content = await trx(table)
                    .whereIn('saved_queries_version_id', chartVersionIds)
                    .select(`*`);

                if (content.length === 0) return undefined;

                Logger.debug(
                    `Copying ${content.length} chart content on ${table} table`,
                );
                const batchSize = 1000;
                const newContent = await trx
                    .batchInsert(
                        table,
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
                        batchSize,
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
                { custom_range: (value: AnyType) => JSON.stringify(value) },
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
                { filters: (value: AnyType) => JSON.stringify(value) },
            );

            // 8888b.     db    .dP"Y8 88  88 88""Yb  dP"Yb     db    88""Yb 8888b.  .dP"Y8
            //  8I  Yb   dPYb   `Ybo." 88  88 88__dP dP   Yb   dPYb   88__dP  8I  Yb `Ybo."
            //  8I  dY  dP__Yb  o.`Y8b 888888 88""Yb Yb   dP  dP__Yb  88"Yb   8I  dY o.`Y8b
            // 8888Y"  dP""""Yb 8bodP' 88  88 88oodP  YbodP  dP""""Yb 88  Yb 8888Y"  8bodP'
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

            const dashboardTabs = await trx(DashboardTabsTableName).whereIn(
                'dashboard_version_id',
                dashboardVersionIds,
            );

            Logger.info(
                `Duplicating ${dashboardTabs.length} dashboard tabs on ${previewProjectUuid}`,
            );
            let newDashboardTabs: DbDashboardTabs[] = [];
            if (dashboardTabs.length > 0) {
                newDashboardTabs = await trx(DashboardTabsTableName)
                    .insert(
                        dashboardTabs.map((d) => ({
                            ...d,
                            uuid: uuidv4(), // we need to generate the uuid here: https://github.com/lightdash/lightdash/issues/10408
                            dashboard_id: dashboardMapping.find(
                                (m) => m.id === d.dashboard_id,
                            )?.newId!,
                            dashboard_version_id: dashboardVersionsMapping.find(
                                (m) => m.id === d.dashboard_version_id,
                            )?.newId!,
                        })),
                    )
                    .returning('*');
            }
            const dashboardTabsMapping = newDashboardTabs.map((c, i) => ({
                uuid: dashboardTabs[i].uuid,
                newUuid: c.uuid,
                dashboardVersionId: dashboardTabs[i].dashboard_version_id,
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

            // update saved_sqls in dashboards
            const updateSavedSQLInDashboards = newSavedSQLInDashboards.map(
                (chart) => {
                    const newDashboardUuid = dashboardMapping.find(
                        (m) => m.uuid === chart.dashboard_uuid,
                    )?.newUuid;

                    if (!newDashboardUuid) {
                        // The dashboard was not copied, perhaps becuase it belongs to a space the user doesn't have access to
                        // We delete this chart in dashboard
                        return trx('saved_sql')
                            .where('saved_sql_uuid', chart.saved_sql_uuid)
                            .delete();
                    }
                    return trx('saved_sql')
                        .update({
                            dashboard_uuid: newDashboardUuid,
                        })
                        .where('saved_sql_uuid', chart.saved_sql_uuid);
                },
            );
            await Promise.all(updateSavedSQLInDashboards);

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
                                  tab_uuid: dashboardTabsMapping.find(
                                      (m) =>
                                          m.uuid === d.tab_uuid &&
                                          m.dashboardVersionId ===
                                              d.dashboard_version_id,
                                  )?.newUuid,
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

                        // only applied to saved sql tiles
                        ...(d.saved_sql_uuid && {
                            saved_sql_uuid: savedSQLMapping.find(
                                (c) => c.id === d.saved_sql_uuid,
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
            await copyDashboardTileContent('dashboard_tile_sql_charts');

            const contentMapping: PreviewContentMapping = {
                charts: chartMapping,
                chartVersions: chartVersionMapping,
                spaces: spaceMapping,
                dashboards: dashboardMapping,
                dashboardVersions: dashboardVersionsMapping,
                savedSql: savedSQLMapping,
                savedSqlVersions: savedSQLVersionMapping,
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

    async createVirtualView(
        projectUuid: string,
        { name, sql, columns }: CreateVirtualViewPayload,
        warehouseClient: WarehouseClient,
    ): Promise<Explore> {
        const virtualView = createVirtualView(
            name,
            sql,
            columns,
            warehouseClient,
        );

        // insert virtual view into cached_explore
        await this.database(CachedExploreTableName)
            .insert({
                project_uuid: projectUuid,
                name: virtualView.name,
                table_names: Object.keys(virtualView.tables || {}),
                explore: virtualView,
            })
            .onConflict(['project_uuid', 'name'])
            .merge()
            .returning(['name', 'cached_explore_uuid']);

        // append virtual view to cached_explores
        await this.database(CachedExploresTableName)
            .where('project_uuid', projectUuid)
            .update({
                explores: this.database.raw(
                    `
                CASE
                    WHEN explores IS NULL THEN ?::jsonb
                    ELSE explores || ?::jsonb
                END
            `,
                    [
                        JSON.stringify([virtualView]),
                        JSON.stringify([virtualView]),
                    ],
                ),
            })
            .returning('*');

        return virtualView;
    }

    async updateVirtualView(
        projectUuid: string,
        exploreName: string,
        payload: UpdateVirtualViewPayload,
        warehouseClient: WarehouseClient,
    ) {
        const translatedToExplore = createVirtualView(
            exploreName,
            payload.sql,
            payload.columns,
            warehouseClient,
            payload.name, // label
        );

        // insert into cached_explore
        await this.database(CachedExploreTableName)
            .update({
                project_uuid: projectUuid,
                name: exploreName,
                table_names: Object.keys(translatedToExplore.tables || {}),
                explore: translatedToExplore,
            })
            .where('project_uuid', projectUuid)
            .andWhere('name', exploreName)
            .returning(['name', 'cached_explore_uuid']);

        // append to cached_explores if it doesn't exist; otherwise, update
        await this.database(CachedExploresTableName)
            .where('project_uuid', projectUuid)
            .update({
                explores: this.database.raw(
                    `
                    CASE
                        WHEN explores IS NULL THEN ?::jsonb
                        ELSE (
                            SELECT jsonb_agg(
                                CASE
                                    WHEN (value->>'name') = ? THEN ?::jsonb
                                    ELSE value
                                END
                            )
                            FROM jsonb_array_elements(
                                CASE
                                    WHEN jsonb_typeof(explores) = 'array' THEN explores
                                    ELSE '[]'::jsonb
                                END
                            )
                        )
                    END
                `,
                    [
                        JSON.stringify([translatedToExplore]),
                        translatedToExplore.name,
                        JSON.stringify(translatedToExplore),
                    ],
                ),
            })
            .returning('*');

        return translatedToExplore;
    }

    async deleteVirtualView(projectUuid: string, name: string) {
        // remove from cached_explore
        await this.database(CachedExploreTableName)
            .where('project_uuid', projectUuid)
            .whereRaw("explore->>'type' = ?", [ExploreType.VIRTUAL])
            .andWhere('name', name)
            .delete();

        // Remove from cached_explores
        await this.database(CachedExploresTableName)
            .where('project_uuid', projectUuid)
            .update({
                explores: this.database.raw(
                    `
                    (
                        SELECT COALESCE(
                            jsonb_agg(explore_obj),
                            '[]'::jsonb
                        )
                        FROM jsonb_array_elements(explores) AS explore_obj
                        WHERE explore_obj->>'name' != ?
                    )
                `,
                    [name],
                ),
            });
    }

    async updateDefaultSchedulerTimezone(
        projectUuid: string,
        timezone: string,
    ) {
        const [updatedProject] = await this.database(ProjectTableName)
            .update({
                scheduler_timezone: timezone,
            })
            .where('project_uuid', projectUuid)
            .returning('*');

        return updatedProject;
    }
}
