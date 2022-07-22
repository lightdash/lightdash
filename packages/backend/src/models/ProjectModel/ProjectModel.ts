import {
    AlreadyExistsError,
    CreateProject,
    CreateWarehouseCredentials,
    DbtProjectConfig,
    Explore,
    ExploreError,
    FullBigqueryCredentials,
    FullDatabricksCredentials,
    FullPostgresCredentials,
    FullRedshiftCredentials,
    FullSnowflakeCredentials,
    FullWarehouseCredentials,
    getSafeWarehouseCredentials,
    isCreateWarehouseCredentials,
    NotExistsError,
    NotFoundError,
    OrganizationProject,
    ParseError,
    Project,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    sensitiveDbtCredentialsFieldNames,
    SSHTunnelConfig,
    SSHTunnelConfigSecrets,
    TablesConfiguration,
    UnexpectedServerError,
    UpdateProject,
    UpdateWarehouseCredentials,
    WarehouseTypes,
} from '@lightdash/common';
import { WarehouseCatalog } from '@lightdash/warehouses';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationTableName } from '../../database/entities/organizations';
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

    private async getSSHTunnelSecrets(
        sshTunnel: SSHTunnelConfig | undefined,
    ): Promise<SSHTunnelConfigSecrets | undefined> {
        if (sshTunnel === undefined) {
            return undefined;
        }
        const [row] = await this.database('ssh_keypairs')
            .select('*')
            .where('public_key', sshTunnel.publicKey);
        if (row === undefined) {
            throw new NotFoundError(
                'Cannot find SSH keys for warehouse connection. Please regenerate keys',
            );
        }
        const privateKey = this.encryptionService.decrypt(
            row.encrypted_private_key,
        );
        return {
            ...sshTunnel,
            privateKey,
        };
    }

    private async updateFullCredentials(
        update: UpdateWarehouseCredentials | undefined,
        existing: FullWarehouseCredentials | undefined,
    ): Promise<FullWarehouseCredentials | undefined> {
        if (update === undefined) {
            return undefined;
        }
        if (existing === undefined) {
            if (!isCreateWarehouseCredentials(update)) {
                throw new ParseError(
                    'Cannot change warehouse type without all required fields',
                );
            }
            return this.getFullWarehouseCredentials(update);
        }
        if (
            update.type === WarehouseTypes.SNOWFLAKE &&
            existing.type === WarehouseTypes.SNOWFLAKE
        ) {
            const merged: FullSnowflakeCredentials = {
                ...update,
                password: update.password || existing.password,
                user: update.user || existing.user,
            };
            return merged;
        }
        if (
            update.type === WarehouseTypes.REDSHIFT &&
            existing.type === WarehouseTypes.REDSHIFT
        ) {
            const merged: FullRedshiftCredentials = {
                ...update,
                password: update.password || existing.password,
                user: update.user || existing.user,
                sshTunnel: await this.getSSHTunnelSecrets(update.sshTunnel),
            };
            return merged;
        }
        if (
            update.type === WarehouseTypes.POSTGRES &&
            existing.type === WarehouseTypes.POSTGRES
        ) {
            const merged: FullPostgresCredentials = {
                ...update,
                password: update.password || existing.password,
                user: update.user || existing.user,
                sshTunnel: await this.getSSHTunnelSecrets(update.sshTunnel),
            };
            return merged;
        }
        if (
            update.type === WarehouseTypes.BIGQUERY &&
            existing.type === WarehouseTypes.BIGQUERY
        ) {
            const merged: FullBigqueryCredentials = {
                ...update,
                keyfileContents:
                    update.keyfileContents || existing.keyfileContents,
            };
            return merged;
        }
        if (
            update.type === WarehouseTypes.DATABRICKS &&
            existing.type === WarehouseTypes.DATABRICKS
        ) {
            const merged: FullDatabricksCredentials = {
                ...update,
                personalAccessToken:
                    update.personalAccessToken || existing.personalAccessToken,
            };
            return merged;
        }

        // If the warehouse type is changing treat it as creating a new warehouse
        if (!isCreateWarehouseCredentials(update)) {
            throw new ParseError(
                'Cannot change warehouse type without all required fields',
            );
        }
        return this.getFullWarehouseCredentials(update);
    }

    async getFullWarehouseCredentials(
        credentials: CreateWarehouseCredentials,
    ): Promise<FullWarehouseCredentials> {
        switch (credentials.type) {
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.REDSHIFT:
                return {
                    ...credentials,
                    sshTunnel: await this.getSSHTunnelSecrets(
                        credentials.sshTunnel,
                    ),
                };
            default:
                return credentials;
        }
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
        if (projects.length === 0) {
            throw new NotExistsError('No project exists');
        }
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
        data: FullWarehouseCredentials,
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
            try {
                let encryptedCredentials: Buffer;
                try {
                    encryptedCredentials = this.encryptionService.encrypt(
                        JSON.stringify(data.dbtConnection),
                    );
                } catch (e) {
                    throw new UnexpectedServerError(
                        'Could not save credentials.',
                    );
                }
                const [project] = await trx('projects')
                    .insert({
                        name: data.name,
                        project_type: data.type,
                        organization_id: orgs[0].organization_id,
                        dbt_connection_type: data.dbtConnection.type,
                        dbt_connection: encryptedCredentials,
                    })
                    .returning('*');

                const fullCredentials = await this.getFullWarehouseCredentials(
                    data.warehouseConnection,
                );
                await this.upsertWarehouseConnection(
                    trx,
                    project.project_id,
                    fullCredentials,
                );

                await trx('spaces').insert({
                    project_id: project.project_id,
                    name: data.name,
                });

                return project.project_uuid;
            } catch (e) {
                await trx.rollback(e);
                throw e;
            }
        });
    }

    async update(
        projectUuid: string,
        data: UpdateProject,
    ): Promise<Project & { warehouseConnection?: FullWarehouseCredentials }> {
        const savedProject = await this.getWithSensitiveFields(projectUuid);
        const dbtConnection = ProjectModel.mergeMissingDbtConfigSecrets(
            data.dbtConnection,
            savedProject.dbtConnection,
        );
        const fullWarehouseCredentials = await this.updateFullCredentials(
            data.warehouseConnection,
            savedProject.warehouseConnection,
        );
        await this.database.transaction(async (trx) => {
            try {
                let encryptedCredentials: Buffer;
                try {
                    encryptedCredentials = this.encryptionService.encrypt(
                        JSON.stringify(dbtConnection),
                    );
                } catch (e) {
                    throw new UnexpectedServerError(
                        'Could not save credentials.',
                    );
                }
                const projects = await trx('projects')
                    .update({
                        name: data.name,
                        dbt_connection_type: dbtConnection.type,
                        dbt_connection: encryptedCredentials,
                    })
                    .where('project_uuid', projectUuid)
                    .returning('*');
                if (projects.length === 0) {
                    throw new UnexpectedServerError(
                        'Could not update project.',
                    );
                }
                const [project] = projects;

                if (fullWarehouseCredentials) {
                    await this.upsertWarehouseConnection(
                        trx,
                        project.project_id,
                        fullWarehouseCredentials,
                    );
                }
            } catch (e) {
                await trx.rollback(e);
                throw e;
            }
        });
        return this.getWithSensitiveFields(projectUuid);
    }

    async delete(projectUuid: string): Promise<void> {
        await this.database('projects')
            .where('project_uuid', projectUuid)
            .delete();
    }

    async getWithSensitiveFields(
        projectUuid: string,
    ): Promise<Project & { warehouseConnection?: FullWarehouseCredentials }> {
        type QueryResult = (
            | {
                  name: string;
                  project_type: ProjectType;
                  dbt_connection: Buffer | null;
                  encrypted_credentials: null;
                  warehouse_type: null;
                  organization_uuid: string;
              }
            | {
                  name: string;
                  project_type: ProjectType;
                  dbt_connection: Buffer | null;
                  encrypted_credentials: Buffer;
                  warehouse_type: string;
                  organization_uuid: string;
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
            ])
            .select<QueryResult>()
            .where('project_uuid', projectUuid);
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
        const result = {
            organizationUuid: project.organization_uuid,
            projectUuid,
            name: project.name,
            type: project.project_type,
            dbtConnection: dbtSensitiveCredentials,
        };
        if (!project.warehouse_type) {
            return result;
        }
        let sensitiveCredentials: FullWarehouseCredentials;
        try {
            sensitiveCredentials = JSON.parse(
                this.encryptionService.decrypt(project.encrypted_credentials),
            ) as FullWarehouseCredentials;
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
        const nonSensitiveCredentials =
            sensitiveCredentials &&
            getSafeWarehouseCredentials(sensitiveCredentials);
        return {
            organizationUuid: project.organizationUuid,
            projectUuid,
            name: project.name,
            type: project.type,
            dbtConnection: nonSensitiveDbtCredentials,
            warehouseConnection: nonSensitiveCredentials,
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
}
