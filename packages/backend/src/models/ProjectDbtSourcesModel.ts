import {
    CreateProjectDbtSource,
    DbtProjectConfig,
    NotFoundError,
    ParameterError,
    ProjectDbtSource,
    UnexpectedServerError,
    UpdateProjectDbtSource,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbProjectDbtSource,
    ProjectDbtSourcesTableName,
} from '../database/entities/projectDbtSources';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

type ProjectDbtSourcesModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

/**
 * Data access for `project_dbt_sources` — the additional dbt sources connected
 * to a project beyond its primary `projects.dbt_connection` (PROD-7484). Rows
 * are returned ordered by precedence so the merge fold is deterministic. The
 * primary source is not stored here; a project with no rows runs the
 * single-source path unchanged (N=0 short-circuit).
 */
export class ProjectDbtSourcesModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(args: ProjectDbtSourcesModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    private decryptConnection(
        encrypted: Buffer | null,
    ): DbtProjectConfig | null {
        if (!encrypted) {
            return null;
        }
        try {
            return JSON.parse(
                this.encryptionUtil.decrypt(encrypted),
            ) as DbtProjectConfig;
        } catch (e) {
            throw new UnexpectedServerError(
                'Failed to load dbt source credentials',
            );
        }
    }

    private encryptConnection(
        connection: DbtProjectConfig | null | undefined,
    ): Buffer | null {
        if (!connection) {
            return null;
        }
        try {
            return this.encryptionUtil.encrypt(JSON.stringify(connection));
        } catch (e) {
            throw new UnexpectedServerError(
                'Could not save dbt source credentials',
            );
        }
    }

    private convertRow(row: DbProjectDbtSource): ProjectDbtSource {
        return {
            projectDbtSourceUuid: row.project_dbt_source_uuid,
            projectUuid: row.project_uuid,
            name: row.name,
            isPrimary: row.is_primary,
            precedence: row.precedence,
            dbtConnection: this.decryptConnection(row.dbt_connection),
            manifestSourceType: row.manifest_source_type,
            manifestS3Key: row.manifest_s3_key,
            manifestUpdatedAt: row.manifest_updated_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    /**
     * All additional sources for a project, ordered by precedence then name
     * (the same order the merge fold uses). Empty when the project has none.
     */
    async getSources(projectUuid: string): Promise<ProjectDbtSource[]> {
        const rows = await this.database(ProjectDbtSourcesTableName)
            .where('project_uuid', projectUuid)
            .orderBy('precedence', 'asc')
            .orderBy('name', 'asc');
        return rows.map((row) => this.convertRow(row));
    }

    /**
     * Whether the project has any additional sources. Drives the N=0
     * short-circuit without decrypting connections.
     */
    async hasSources(projectUuid: string): Promise<boolean> {
        const row = await this.database(ProjectDbtSourcesTableName)
            .where('project_uuid', projectUuid)
            .first();
        return row !== undefined;
    }

    async getSource(projectDbtSourceUuid: string): Promise<ProjectDbtSource> {
        const row = await this.database(ProjectDbtSourcesTableName)
            .where('project_dbt_source_uuid', projectDbtSourceUuid)
            .first();
        if (!row) {
            throw new NotFoundError(
                `Cannot find dbt source with id: ${projectDbtSourceUuid}`,
            );
        }
        return this.convertRow(row);
    }

    async createSource(
        projectUuid: string,
        data: CreateProjectDbtSource,
    ): Promise<ProjectDbtSource> {
        const [row] = await this.database(ProjectDbtSourcesTableName)
            .insert({
                project_uuid: projectUuid,
                name: data.name,
                is_primary: data.isPrimary,
                precedence: data.precedence,
                dbt_connection_type: data.dbtConnection?.type ?? null,
                dbt_connection: this.encryptConnection(data.dbtConnection),
                manifest_source_type: 'inline',
                manifest_s3_key: null,
            })
            .returning('*');
        return this.convertRow(row);
    }

    async updateSource(
        projectDbtSourceUuid: string,
        data: UpdateProjectDbtSource,
    ): Promise<ProjectDbtSource> {
        const [row] = await this.database(ProjectDbtSourcesTableName)
            .where('project_dbt_source_uuid', projectDbtSourceUuid)
            .update({
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.precedence !== undefined
                    ? { precedence: data.precedence }
                    : {}),
                ...(data.dbtConnection !== undefined
                    ? {
                          dbt_connection_type: data.dbtConnection?.type ?? null,
                          dbt_connection: this.encryptConnection(
                              data.dbtConnection,
                          ),
                      }
                    : {}),
                updated_at: new Date(),
            })
            .returning('*');
        if (!row) {
            throw new NotFoundError(
                `Cannot find dbt source with id: ${projectDbtSourceUuid}`,
            );
        }
        return this.convertRow(row);
    }

    async deleteSource(projectDbtSourceUuid: string): Promise<void> {
        const source = await this.getSource(projectDbtSourceUuid);
        if (source.isPrimary) {
            throw new ParameterError(
                'Cannot delete the primary dbt source of a project',
            );
        }
        await this.database(ProjectDbtSourcesTableName)
            .where('project_dbt_source_uuid', projectDbtSourceUuid)
            .delete();
    }
}
