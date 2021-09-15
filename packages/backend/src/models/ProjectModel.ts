import { Knex } from 'knex';
import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    OrganizationProject,
    Project,
    sensitiveCredentialsFieldNames,
    sensitiveDbtCredentialsFieldNames,
    WarehouseCredentials,
} from 'common';
import { LightdashConfig } from '../config/parseConfig';
import { NotExistsError, UnexpectedServerError } from '../errors';
import { ProjectTableName } from '../database/entities/projects';
import { WarehouseCredentialTableName } from '../database/entities/warehouseCredentials';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';

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

    async updateCredentials(
        projectUuid: string,
        credentials: CreateWarehouseCredentials,
    ): Promise<void> {
        const projects = await this.database('projects')
            .where('project_uuid', projectUuid)
            .select('*');
        if (projects.length === 0) {
            throw new NotExistsError(
                `No project exists with id ${projectUuid}`,
            );
        }
        const [project] = projects;
        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionService.encrypt(
                JSON.stringify(credentials),
            );
        } catch (e) {
            throw new UnexpectedServerError('Could not save credentials.');
        }
        await this.database('warehouse_credentials')
            .insert({
                project_id: project.project_id,
                warehouse_type: credentials.type,
                encrypted_credentials: encryptedCredentials,
            })
            .onConflict('project_id')
            .merge();
    }

    async getWithSensitiveFields(
        projectUuid: string,
    ): Promise<Project & { warehouseConnection?: CreateWarehouseCredentials }> {
        type QueryResult = (
            | {
                  name: string;
                  encrypted_credentials: null;
                  warehouse_type: null;
              }
            | {
                  name: string;
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
        const result = {
            projectUuid,
            name: project.name,
            dbtConnection: this.lightdashConfig.projects[0],
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
            throw new UnexpectedServerError('Failed to load credentials');
        }
        return {
            ...result,
            warehouseConnection: sensitiveCredentials,
        };
    }

    async get(projectUuid: string): Promise<Project> {
        const project = await this.getWithSensitiveFields(projectUuid);
        const sensitiveCredentials = project.warehouseConnection;
        if (sensitiveCredentials === undefined) {
            return project;
        }
        const nonSensitiveDbtCredentials = Object.fromEntries(
            Object.entries(this.lightdashConfig.projects[0]).filter(
                ([key]) =>
                    !sensitiveDbtCredentialsFieldNames.includes(key as any),
            ),
        ) as DbtProjectConfig;
        const nonSensitiveCredentials = Object.fromEntries(
            Object.entries(sensitiveCredentials).filter(
                ([key]) => !sensitiveCredentialsFieldNames.includes(key as any),
            ),
        ) as WarehouseCredentials;
        return {
            projectUuid,
            name: project.name,
            dbtConnection: nonSensitiveDbtCredentials,
            warehouseConnection: nonSensitiveCredentials,
        };
    }

    private async _getDefaultProjectUuid(): Promise<string> {
        // app only allows one project per deployment currently
        const projects = await this.database('projects').select('*');
        if (projects.length === 0) {
            throw new NotExistsError('No project exists');
        }
        const [project] = projects;
        return project.project_uuid;
    }

    async getDefault(): Promise<Project> {
        const uuid = await this._getDefaultProjectUuid();
        const project = await this.get(uuid);
        return project;
    }

    async getDefaultWithSensitiveFields(): Promise<
        Project & { warehouseConnection?: CreateWarehouseCredentials }
    > {
        const uuid = await this._getDefaultProjectUuid();
        const project = await this.getWithSensitiveFields(uuid);
        return project;
    }
}
