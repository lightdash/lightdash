import {
    AlreadyExistsError,
    CreateProjectDbtSource,
    DbtProjectConfig,
    NotFoundError,
    ParameterError,
    ProjectDbtSource,
    UnexpectedServerError,
    UpdateProjectDbtSource,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import {
    DbProjectDbtSource,
    ProjectDbtSourcesTableName,
} from '../database/entities/projectDbtSources';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

const PG_UNIQUE_VIOLATION = '23505';

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

    /**
     * Never throws: a source whose credentials cannot be decrypted (e.g. after
     * an encryption secret rotation) must not take down every other source in
     * the same list/compile — it is reported via `hasCredentialError` instead,
     * and the caller decides whether that source can be skipped (compiling,
     * listing) or must fail by name (editing, compiling only this source).
     */
    private tryDecryptConnection(encrypted: Buffer | null): {
        dbtConnection: DbtProjectConfig | null;
        hasCredentialError: boolean;
    } {
        if (!encrypted) {
            return { dbtConnection: null, hasCredentialError: false };
        }
        try {
            return {
                dbtConnection: JSON.parse(
                    this.encryptionUtil.decrypt(encrypted),
                ) as DbtProjectConfig,
                hasCredentialError: false,
            };
        } catch (e) {
            return { dbtConnection: null, hasCredentialError: true };
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
        const { dbtConnection, hasCredentialError } = this.tryDecryptConnection(
            row.dbt_connection,
        );
        return {
            projectDbtSourceUuid: row.project_dbt_source_uuid,
            projectUuid: row.project_uuid,
            name: row.name,
            isPrimary: row.is_primary,
            precedence: row.precedence,
            dbtConnection,
            hasCredentialError,
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
        try {
            const [row] = await this.database(ProjectDbtSourcesTableName)
                .insert({
                    project_uuid: projectUuid,
                    name: data.name,
                    is_primary: data.isPrimary,
                    precedence: data.precedence,
                    dbt_connection_type: data.dbtConnection?.type ?? null,
                    dbt_connection: this.encryptConnection(data.dbtConnection),
                })
                .returning('*');
            return this.convertRow(row);
        } catch (error) {
            if (
                error instanceof DatabaseError &&
                error.code === PG_UNIQUE_VIOLATION
            ) {
                throw new AlreadyExistsError(
                    `A dbt source named "${data.name}" already exists on this project`,
                );
            }
            throw error;
        }
    }

    async updateSource(
        projectDbtSourceUuid: string,
        data: UpdateProjectDbtSource,
    ): Promise<ProjectDbtSource> {
        let row: DbProjectDbtSource | undefined;
        try {
            [row] = await this.database(ProjectDbtSourcesTableName)
                .where('project_dbt_source_uuid', projectDbtSourceUuid)
                .update({
                    ...(data.name !== undefined ? { name: data.name } : {}),
                    ...(data.precedence !== undefined
                        ? { precedence: data.precedence }
                        : {}),
                    ...(data.dbtConnection !== undefined
                        ? {
                              dbt_connection_type:
                                  data.dbtConnection?.type ?? null,
                              dbt_connection: this.encryptConnection(
                                  data.dbtConnection,
                              ),
                          }
                        : {}),
                    updated_at: new Date(),
                })
                .returning('*');
        } catch (error) {
            if (
                error instanceof DatabaseError &&
                error.code === PG_UNIQUE_VIOLATION &&
                data.name !== undefined
            ) {
                throw new AlreadyExistsError(
                    `A dbt source named "${data.name}" already exists on this project`,
                );
            }
            throw error;
        }
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
