import { type DbtExternalModelNode } from '@lightdash/common';
import { createHash } from 'crypto';
import { type Knex } from 'knex';
import { DbtSourceRefCatalogsTableName } from '../database/entities/dbtSourceRefCatalogs';

export class DbtSourceRefCatalogModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async get(projectUuid: string, connectionGroup: string) {
        return this.database(DbtSourceRefCatalogsTableName).where({
            project_uuid: projectUuid,
            connection_group: connectionGroup,
            status: 'confirmed',
        });
    }

    async getProjectNames(projectUuid: string) {
        return this.database(DbtSourceRefCatalogsTableName)
            .select('dbt_source_uuid', 'project_name')
            .where('project_uuid', projectUuid);
    }

    async replaceConfirmed({
        projectUuid,
        connectionGroup,
        dbtVersion,
        compileJobUuid,
        entries,
    }: {
        projectUuid: string;
        connectionGroup: string;
        dbtVersion: string;
        compileJobUuid: string | null;
        entries: {
            dbtSourceUuid: string;
            projectName: string;
            nodes: DbtExternalModelNode[];
            referencedProjects: string[];
        }[];
    }): Promise<void> {
        if (entries.length === 0) return;
        const rows = entries.map((entry) => ({
            project_uuid: projectUuid,
            dbt_source_uuid: entry.dbtSourceUuid,
            connection_group: connectionGroup,
            project_name: entry.projectName,
            dbt_version: dbtVersion,
            status: 'confirmed' as const,
            nodes: JSON.stringify(entry.nodes),
            referenced_projects: JSON.stringify(entry.referencedProjects),
            nodes_digest: createHash('sha256')
                .update(
                    JSON.stringify({
                        nodes: entry.nodes,
                        referencedProjects: entry.referencedProjects,
                    }),
                )
                .digest('hex'),
            compile_job_uuid: compileJobUuid,
            updated_at: new Date(),
        }));
        await this.database(DbtSourceRefCatalogsTableName)
            .insert(rows)
            .onConflict(['project_uuid', 'dbt_source_uuid', 'connection_group'])
            .merge();
    }

    async upsertProvisional({
        projectUuid,
        dbtSourceUuid,
        connectionGroup,
        projectName,
        dbtVersion,
        nodes,
        referencedProjects,
        compileJobUuid,
    }: {
        projectUuid: string;
        dbtSourceUuid: string;
        connectionGroup: string;
        projectName: string;
        dbtVersion: string;
        nodes: DbtExternalModelNode[];
        referencedProjects: string[];
        compileJobUuid: string | null;
    }): Promise<string> {
        const serialized = JSON.stringify(nodes);
        const digest = createHash('sha256')
            .update(JSON.stringify({ nodes, referencedProjects }))
            .digest('hex');
        await this.database(DbtSourceRefCatalogsTableName)
            .insert({
                project_uuid: projectUuid,
                dbt_source_uuid: dbtSourceUuid,
                connection_group: connectionGroup,
                project_name: projectName,
                dbt_version: dbtVersion,
                status: 'provisional',
                nodes: serialized,
                referenced_projects: JSON.stringify(referencedProjects),
                nodes_digest: digest,
                compile_job_uuid: compileJobUuid,
            })
            .onConflict(['project_uuid', 'dbt_source_uuid', 'connection_group'])
            .merge({
                project_name: projectName,
                dbt_version: dbtVersion,
                status: 'provisional',
                nodes: serialized,
                referenced_projects: JSON.stringify(referencedProjects),
                nodes_digest: digest,
                compile_job_uuid: compileJobUuid,
                updated_at: new Date(),
            })
            .where(`${DbtSourceRefCatalogsTableName}.status`, 'provisional');
        return digest;
    }

    async confirm({
        projectUuid,
        connectionGroup,
        entries,
    }: {
        projectUuid: string;
        connectionGroup: string;
        entries: { dbtSourceUuid: string; nodesDigest: string }[];
    }): Promise<void> {
        if (entries.length === 0) return;
        await this.database(DbtSourceRefCatalogsTableName)
            .where({
                project_uuid: projectUuid,
                connection_group: connectionGroup,
            })
            .where((query) => {
                entries.forEach((entry) =>
                    query.orWhere({
                        dbt_source_uuid: entry.dbtSourceUuid,
                        nodes_digest: entry.nodesDigest,
                    }),
                );
            })
            .update({ status: 'confirmed', updated_at: new Date() });
    }

    async deleteForSource(
        projectUuid: string,
        dbtSourceUuid: string,
    ): Promise<void> {
        await this.database(DbtSourceRefCatalogsTableName)
            .where({
                project_uuid: projectUuid,
                dbt_source_uuid: dbtSourceUuid,
            })
            .delete();
    }

    async deleteForProject(
        projectUuid: string,
        connectionGroup: string | null,
    ): Promise<void> {
        const query = this.database(DbtSourceRefCatalogsTableName).where({
            project_uuid: projectUuid,
        });
        if (connectionGroup !== null)
            query.where({ connection_group: connectionGroup });
        await query.delete();
    }
}
