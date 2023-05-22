import {
    AlreadyExistsError,
    CreateDbtCloudIntegration,
    CreateProject,
    CreateWarehouseCredentials,
    DbtCloudIntegration,
    DbtProjectConfig,
    Explore,
    ExploreError,
    NotExistsError,
    OrganizationProject,
    Project,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    sensitiveCredentialsFieldNames,
    sensitiveDbtCredentialsFieldNames,
    TablesConfiguration,
    UnexpectedServerError,
    UpdateProject,
    WarehouseCredentials,
} from '@lightdash/common';
import {
    WarehouseCatalog,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import { v4 as uuid4 } from 'uuid';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationTableName } from '../../database/entities/organizations';
import { PinnedListTableName } from '../../database/entities/pinnedList';
import { DbProjectMembership } from '../../database/entities/projectMemberships';
import {
    CachedExploresTableName,
    CachedWarehouseTableName,
    DbCachedExplores,
    DbCachedWarehouse,
    DbProject,
    ProjectTableName,
} from '../../database/entities/projects';
import { DbUser } from '../../database/entities/users';
import { WarehouseCredentialTableName } from '../../database/entities/warehouseCredentials';
import Logger from '../../logger';
import { EncryptionService } from '../../services/EncryptionService/EncryptionService';
import Transaction = Knex.Transaction;

type ProjectModelDependencies = {
    database: Knex;
    lightdashConfig: LightdashConfig;
    encryptionService: EncryptionService;
};

const CACHED_EXPLORES_PG_LOCK_NAMESPACE = 1;

export class ProjectModel {
    private database: Knex;

    private lightdashConfig: LightdashConfig;

    private encryptionService: EncryptionService;

    constructor(deps: ProjectModelDependencies) {
        this.database = deps.database;
        this.lightdashConfig = deps.lightdashConfig;
        this.encryptionService = deps.encryptionService;
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
            .select('project_uuid', 'name', 'project_type')
            .where('organization_id', orgs[0].organization_id);

        return projects.map<OrganizationProject>(
            ({ name, project_uuid, project_type }) => ({
                name,
                projectUuid: project_uuid,
                type: project_type,
            }),
        );
    }

    private async upsertWarehouseConnection(
        trx: Transaction,
        projectId: number,
        data: CreateWarehouseCredentials,
    ): Promise<void> {
        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionService.encrypt(
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
                encryptedCredentials = this.encryptionService.encrypt(
                    JSON.stringify(data.dbtConnection),
                );
            } catch (e) {
                throw new UnexpectedServerError('Could not save credentials.');
            }
            const [project] = await trx('projects')
                .insert({
                    name: data.name,
                    project_type: data.type,
                    organization_id: orgs[0].organization_id,
                    dbt_connection_type: data.dbtConnection.type,
                    dbt_connection: encryptedCredentials,
                    copied_from_project_uuid:
                        data.copiedFromProjectUuid || null,
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
            });

            return project.project_uuid;
        });
    }

    async update(projectUuid: string, data: UpdateProject): Promise<void> {
        await this.database.transaction(async (trx) => {
            let encryptedCredentials: Buffer;
            try {
                encryptedCredentials = this.encryptionService.encrypt(
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
              }
            | {
                  name: string;
                  project_type: ProjectType;
                  dbt_connection: Buffer | null;
                  encrypted_credentials: Buffer;
                  warehouse_type: string;
                  organization_uuid: string;
                  pinned_list_uuid?: string;
              }
        )[];
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
                this.database.ref('project_type').withSchema(ProjectTableName),
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
            throw new NotExistsError('Project has no valid dbt credentials');
        }
        let dbtSensitiveCredentials: DbtProjectConfig;
        try {
            dbtSensitiveCredentials = JSON.parse(
                this.encryptionService.decrypt(project.dbt_connection),
            ) as DbtProjectConfig;
        } catch (e) {
            throw new UnexpectedServerError('Failed to load dbt credentials');
        }
        const result: Omit<Project, 'warehouseConnection'> = {
            organizationUuid: project.organization_uuid,
            projectUuid,
            name: project.name,
            type: project.project_type,
            dbtConnection: dbtSensitiveCredentials,
            pinnedListUuid: project.pinned_list_uuid,
        };
        if (!project.warehouse_type) {
            return result;
        }
        let sensitiveCredentials: CreateWarehouseCredentials;
        try {
            sensitiveCredentials = JSON.parse(
                this.encryptionService.decrypt(project.encrypted_credentials),
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

    async getExploreFromCache(
        projectUuid: string,
        exploreName: string,
    ): Promise<Explore | ExploreError> {
        const [row] = await this.database('cached_explores')
            .select<{ explore: Explore | ExploreError }[]>(['explore'])
            .crossJoin(
                this.database.raw('jsonb_array_elements(explores) as explore'),
            )
            .where('project_uuid', projectUuid)
            .andWhereRaw(
                this.database.raw("explore->>'name' = ?", [exploreName]),
            );
        if (row === undefined) {
            throw new NotExistsError(
                `Explore "${exploreName}" does not exist.`,
            );
        }
        return row.explore;
    }

    async saveExploresToCache(
        projectUuid: string,
        explores: (Explore | ExploreError)[],
    ): Promise<DbCachedExplores> {
        const [cachedExplores] = await this.database(CachedExploresTableName)
            .insert({
                project_uuid: projectUuid,
                explores: JSON.stringify(explores),
            })
            .onConflict('project_uuid')
            .merge()
            .returning('*');
        return cachedExplores;
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
                SELECT
                    pg_try_advisory_xact_lock(${CACHED_EXPLORES_PG_LOCK_NAMESPACE}, project_id)
                FROM
                    projects
                WHERE
                    project_uuid = '${projectUuid}'
                LIMIT 1  `);

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
                .select('project_id')
                .where('project_uuid', projectUuid);

            const [user] = await this.database('users')
                .leftJoin('emails', 'emails.user_id', 'users.user_id')
                .select('users.user_id')
                .where('email', email);
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

    async deleteProjectAccess(
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.raw<(DbProjectMembership & DbProject & DbUser)[]>(
            `
            DELETE FROM project_memberships AS m
            USING projects AS p, users AS u
            WHERE p.project_id = m.project_id
              AND u.user_id = m.user_id
              AND user_uuid = :userUuid
              AND p.project_uuid = :projectUuid
        `,
            { projectUuid, userUuid },
        );
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
        const serviceToken = this.encryptionService.decrypt(row.service_token);
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
        const encryptedServiceToken = this.encryptionService.encrypt(
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
            DELETE FROM dbt_cloud_integrations AS i
            USING projects AS p
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
                this.encryptionService.decrypt(row.encrypted_credentials),
            ) as CreateWarehouseCredentials;
        } catch (e) {
            throw new UnexpectedServerError(
                'Unexpected error: failed to parse warehouse credentials',
            );
        }
    }

    async duplicateContent(projectUuid: string, previewProjectUuid: string) {
        Logger.debug(
            `Duplicating content from ${projectUuid} to ${previewProjectUuid}`,
        );

        return this.database.transaction(async (trx) => {
            const previewProject = await trx('projects')
                .where('project_uuid', previewProjectUuid)
                .first();
            const spaces = await trx('spaces')
                .leftJoin(
                    'projects',
                    'projects.project_id',
                    'spaces.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .select('spaces.*');

            Logger.debug(
                `Duplicating ${spaces.length} spaces on ${previewProjectUuid}`,
            );
            const spaceIds = spaces.map((s) => s.space_id);

            const newSpaces = await trx('spaces')
                .insert(
                    spaces.map((d) => ({
                        ...d,
                        space_id: undefined,
                        space_uuid: undefined,
                        project_id: previewProject?.project_id,
                    })),
                )
                .returning('*');

            const spaceMapping = spaces.map((s, i) => ({
                space_id: s.space_id,
                space_uuid: s.space_uuid,
                new_space_id: newSpaces[i].space_id,
                new_space_uuid: newSpaces[i].space_uuid,
            }));
            const spaceShares = await trx('space_share').whereIn(
                'space_id',
                spaceIds,
            );

            const newSpaceShare = await trx('space_share')
                .insert(
                    spaceShares.map((d) => ({
                        ...d,
                        space_id: spaceMapping.find(
                            (s) => s.space_id === d.space_id,
                        )?.new_space_id!,
                    })),
                )
                .returning('*');

            const charts = await trx('saved_queries')
                .leftJoin('spaces', 'saved_queries.space_id', 'spaces.space_id')
                .leftJoin(
                    'projects',
                    'projects.project_id',
                    'spaces.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .select('saved_queries.*');

            const chartIds = charts.map((d) => d.saved_query_id);
            Logger.debug(
                `Duplicating ${charts.length} charts on ${previewProjectUuid}`,
            );

            const newCharts = await trx('saved_queries')
                .insert(
                    charts.map((d) => ({
                        ...d,
                        saved_query_id: undefined,
                        saved_query_uuid: undefined,
                        space_id: spaceMapping.find(
                            (s) => s.space_id === d.space_id,
                        )?.new_space_id,
                    })),
                )
                .returning('*');

            const chartMapping = charts.map((c, i) => ({
                chart_id: c.saved_query_id,
                new_chart_id: newCharts[i].saved_query_id,
                chart_uuid: c.saved_query_uuid,
                new_chart_uuid: newCharts[i].saved_query_uuid,
            }));

            const chartVersions = await trx('saved_queries_versions')
                .whereIn('saved_query_id', chartIds)

                .select('saved_queries_versions.*');

            const chartVersionIds = chartVersions.map(
                (d) => d.saved_queries_version_id,
            );

            // TODO only insert last chart version
            const newChartVersions = await trx('saved_queries_versions')
                .insert(
                    chartVersions.map((d) => ({
                        ...d,
                        saved_queries_version_id: undefined,
                        saved_queries_version_uuid: undefined,
                        saved_query_id: chartMapping.find(
                            (m) => m.chart_id === d.saved_query_id,
                        )?.new_chart_id,
                    })),
                )
                .returning('*');

            const chartVersionMapping = chartVersions.map((c, i) => ({
                chart_id: c.saved_query_id,
                new_chart_id: newChartVersions[i].saved_query_id,
                chart_version_id: c.saved_queries_version_id,
                new_chart_version_id:
                    newChartVersions[i].saved_queries_version_id,
                chart_version_uuid: c.saved_queries_version_uuid,
                new_chart_version_uuid:
                    newChartVersions[i].saved_queries_version_uuid,
            }));

            const chartVersionFields = await trx('saved_queries_version_fields')
                .whereIn('saved_queries_version_id', chartVersionIds)
                .select('saved_queries_version_fields.*');

            const newChartVersionFields = await trx(
                'saved_queries_version_fields',
            )
                .insert(
                    chartVersionFields.map((d) => ({
                        ...d,
                        saved_queries_version_field_id: undefined,
                        saved_queries_version_id: chartVersionMapping.find(
                            (m) =>
                                m.chart_version_id ===
                                d.saved_queries_version_id,
                        )?.new_chart_version_id,
                    })),
                )
                .returning('*');

            const dashboards = await trx('dashboards')
                .leftJoin('spaces', 'dashboards.space_id', 'spaces.space_id')
                .leftJoin(
                    'projects',
                    'projects.project_id',
                    'spaces.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .select('dashboards.*');

            const dashboardIds = dashboards.map((d) => d.dashboard_id);

            Logger.debug(
                `Duplicating ${chartVersions.length} dashboards on ${previewProjectUuid}`,
            );

            const newDashboards = await trx('dashboards')
                .insert(
                    dashboards.map((d) => ({
                        ...d,
                        dashboard_id: undefined,
                        dashboard_uuid: undefined,
                        space_id: spaceMapping.find(
                            (s) => s.space_id === d.space_id,
                        )?.new_space_id,
                    })),
                )
                .returning('*');

            const dashboardMapping = dashboards.map((c, i) => ({
                dashboard_id: c.dashboard_id,
                new_dashboard_id: newDashboards[i].dashboard_id,
                dashboard_uuid: c.dashboard_uuid,
                new_dashboard_uuid: newDashboards[i].dashboard_uuid,
            }));

            const dashboardVersions = await trx('dashboard_versions').whereIn(
                'dashboard_id',
                dashboardIds,
            );

            const dashboardVersionIds = dashboardVersions.map(
                (dv) => dv.dashboard_version_id,
            );
            const newDashboardVersions = await trx('dashboard_versions')
                .insert(
                    dashboardVersions.map((d) => ({
                        ...d,
                        dashboard_version_id: undefined,
                        dashboard_id: dashboardMapping.find(
                            (m) => m.dashboard_id === d.dashboard_id,
                        )?.new_dashboard_id!,
                    })),
                )
                .returning('*');

            // TODO insert latest version ?
            const dashboardVersionsMapping = dashboardVersions.map((c, i) => ({
                dashboard_version_id: c.dashboard_version_id,
                new_dashboard_version_id:
                    newDashboardVersions[i].dashboard_version_id,
            }));

            const dashboardTiles = await trx('dashboard_tiles').whereIn(
                'dashboard_version_id',
                dashboardVersionIds,
            );

            const dashboardTileUuids = dashboardTiles.map(
                (dv) => dv.dashboard_tile_uuid,
            );

            const newDashboardTiles = await trx('dashboard_tiles')
                .insert(
                    dashboardTiles.map((d) => ({
                        ...d,
                        dashboard_tile_uuid: uuid4(),
                        dashboard_version_id: dashboardVersionsMapping.find(
                            (m) =>
                                m.dashboard_version_id ===
                                d.dashboard_version_id,
                        )?.new_dashboard_version_id!,
                    })),
                )
                .returning('*');

            const dashboardTilesMapping = dashboardTiles.map((c, i) => ({
                dashboard_tile_uuid: c.dashboard_tile_uuid,
                new_dashboard_tile_uuid:
                    newDashboardTiles[i].dashboard_tile_uuid,
            }));

            // Tile charts
            const tileCharts = await trx('dashboard_tile_charts').whereIn(
                'dashboard_tile_uuid',
                dashboardTileUuids,
            );

            const newTileCharts = await trx('dashboard_tile_charts').insert(
                tileCharts.map((d) => ({
                    ...d,
                    saved_chart_id: chartMapping.find(
                        (c) => c.chart_id === d.saved_chart_id,
                    )?.new_chart_id,
                    dashboard_version_id: dashboardVersionsMapping.find(
                        (m) =>
                            m.dashboard_version_id === d.dashboard_version_id,
                    )?.new_dashboard_version_id!,
                    dashboard_tile_uuid: dashboardTilesMapping.find(
                        (m) => m.dashboard_tile_uuid === d.dashboard_tile_uuid,
                    )?.new_dashboard_tile_uuid!,
                })),
            );
            // Tile looms
            const tileLooms = await trx('dashboard_tile_looms').whereIn(
                'dashboard_tile_uuid',
                dashboardTileUuids,
            );

            const newTileLooms = await trx('dashboard_tile_looms').insert(
                tileLooms.map((d) => ({
                    ...d,
                    dashboard_version_id: dashboardVersionsMapping.find(
                        (m) =>
                            m.dashboard_version_id === d.dashboard_version_id,
                    )?.new_dashboard_version_id!,
                    dashboard_tile_uuid: dashboardTilesMapping.find(
                        (m) => m.dashboard_tile_uuid === d.dashboard_tile_uuid,
                    )?.new_dashboard_tile_uuid!,
                })),
            );
            // Tile markdowns
            const tileMarkdowns = await trx('dashboard_tile_markdowns').whereIn(
                'dashboard_tile_uuid',
                dashboardTileUuids,
            );

            const newTileMarkdowns = await trx(
                'dashboard_tile_markdowns',
            ).insert(
                tileMarkdowns.map((d) => ({
                    ...d,
                    dashboard_version_id: dashboardVersionsMapping.find(
                        (m) =>
                            m.dashboard_version_id === d.dashboard_version_id,
                    )?.new_dashboard_version_id!,
                    dashboard_tile_uuid: dashboardTilesMapping.find(
                        (m) => m.dashboard_tile_uuid === d.dashboard_tile_uuid,
                    )?.new_dashboard_tile_uuid!,
                })),
            );
        });
    }

    // Easier to mock in ProjectService
    // eslint-disable-next-line class-methods-use-this
    getWarehouseClientFromCredentials(credentials: CreateWarehouseCredentials) {
        return warehouseClientFromCredentials(credentials);
    }
}
