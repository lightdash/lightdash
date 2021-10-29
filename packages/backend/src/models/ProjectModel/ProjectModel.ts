import { Knex } from 'knex';
import {
    CreateProject,
    CreateWarehouseCredentials,
    DbtProjectConfig,
    OrganizationProject,
    Project,
    sensitiveCredentialsFieldNames,
    sensitiveDbtCredentialsFieldNames,
    UpdateProject,
    WarehouseCredentials,
} from 'common';
import { LightdashConfig } from '../../config/parseConfig';
import { NotExistsError, UnexpectedServerError } from '../../errors';
import { ProjectTableName } from '../../database/entities/projects';
import { WarehouseCredentialTableName } from '../../database/entities/warehouseCredentials';
import { EncryptionService } from '../../services/EncryptionService/EncryptionService';
import Transaction = Knex.Transaction;

type ProjectModelDependencies = {
    database: Knex;
    lightdashConfig: LightdashConfig;
    encryptionService: EncryptionService;
};

export class ProjectModel {
    private database: Knex;

    private lightdashConfig: LightdashConfig;

    private encryptionService: EncryptionService;

    constructor(deps: ProjectModelDependencies) {
        this.database = deps.database;
        this.lightdashConfig = deps.lightdashConfig;
        this.encryptionService = deps.encryptionService;
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
            .select('project_uuid', 'name')
            .where('organization_id', orgs[0].organization_id);
        if (projects.length === 0) {
            throw new NotExistsError('No project exists');
        }
        return projects.map<OrganizationProject>(({ name, project_uuid }) => ({
            name,
            projectUuid: project_uuid,
        }));
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

    async hasProjects(): Promise<boolean> {
        const projects = await this.database('projects').select('project_uuid');
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
                        organization_id: orgs[0].organization_id,
                        dbt_connection_type: data.dbtConnection.type,
                        dbt_connection: encryptedCredentials,
                    })
                    .returning('*');

                await this.upsertWarehouseConnection(
                    trx,
                    project.project_id,
                    data.warehouseConnection,
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

    async update(projectUuid: string, data: UpdateProject): Promise<void> {
        await this.database.transaction(async (trx) => {
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
                const projects = await trx('projects')
                    .update({
                        name: data.name,
                        dbt_connection_type: data.dbtConnection.type,
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

                await this.upsertWarehouseConnection(
                    trx,
                    project.project_id,
                    data.warehouseConnection,
                );
            } catch (e) {
                await trx.rollback(e);
                throw e;
            }
        });
    }

    async getWithSensitiveFields(
        projectUuid: string,
    ): Promise<Project & { warehouseConnection?: CreateWarehouseCredentials }> {
        type QueryResult = (
            | {
                  name: string;
                  dbt_connection: Buffer | null;
                  encrypted_credentials: null;
                  warehouse_type: null;
              }
            | {
                  name: string;
                  dbt_connection: Buffer | null;
                  encrypted_credentials: Buffer;
                  warehouse_type: string;
              }
        )[];
        const projects = await this.database('projects')
            .leftJoin(
                WarehouseCredentialTableName,
                'warehouse_credentials.project_id',
                'projects.project_id',
            )
            .column([
                this.database.ref('name').withSchema(ProjectTableName),
                this.database
                    .ref('dbt_connection')
                    .withSchema(ProjectTableName),
                this.database
                    .ref('encrypted_credentials')
                    .withSchema(WarehouseCredentialTableName),
                this.database
                    .ref('warehouse_type')
                    .withSchema(WarehouseCredentialTableName),
            ])
            .select<QueryResult>()
            .where('project_uuid', projectUuid);
        if (projects.length === 0) {
            throw new NotExistsError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        const [project] = projects;
        let dbtSensitiveCredentials: DbtProjectConfig =
            this.lightdashConfig.projects[0];
        if (project.dbt_connection) {
            try {
                dbtSensitiveCredentials = JSON.parse(
                    this.encryptionService.decrypt(project.dbt_connection),
                ) as DbtProjectConfig;
            } catch (e) {
                throw new UnexpectedServerError(
                    'Failed to load dbt credentials',
                );
            }
        }
        const result = {
            projectUuid,
            name: project.name,
            dbtConnection: dbtSensitiveCredentials,
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
            projectUuid,
            name: project.name,
            dbtConnection: nonSensitiveDbtCredentials,
            warehouseConnection: nonSensitiveCredentials,
        };
    }
}
