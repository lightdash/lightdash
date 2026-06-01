import { ProjectCiStatus } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbProjectCiStatus,
    ProjectCiStatusTable,
    ProjectCiStatusTableName,
} from '../database/entities/projectCiStatus';

type Dependencies = {
    database: Knex;
};

const mapDbToProjectCiStatus = (row: DbProjectCiStatus): ProjectCiStatus => ({
    projectUuid: row.project_uuid,
    hasPreviewDeployWorkflow: row.has_preview_deploy_workflow,
    workflowPath: row.workflow_path,
    detectedCommitSha: row.detected_commit_sha,
    checkedAt: row.checked_at,
});

export class ProjectCiStatusModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async findByProjectUuid(
        projectUuid: string,
    ): Promise<ProjectCiStatus | null> {
        const row = await this.database<ProjectCiStatusTable>(
            ProjectCiStatusTableName,
        )
            .where('project_uuid', projectUuid)
            .first();
        return row ? mapDbToProjectCiStatus(row) : null;
    }

    async upsert(data: {
        projectUuid: string;
        hasPreviewDeployWorkflow: boolean;
        workflowPath: string | null;
        detectedCommitSha: string | null;
    }): Promise<ProjectCiStatus> {
        const [row] = await this.database<ProjectCiStatusTable>(
            ProjectCiStatusTableName,
        )
            .insert({
                project_uuid: data.projectUuid,
                has_preview_deploy_workflow: data.hasPreviewDeployWorkflow,
                workflow_path: data.workflowPath,
                detected_commit_sha: data.detectedCommitSha,
                checked_at: new Date(),
            })
            .onConflict('project_uuid')
            .merge([
                'has_preview_deploy_workflow',
                'workflow_path',
                'detected_commit_sha',
                'checked_at',
            ])
            .returning('*');
        return mapDbToProjectCiStatus(row);
    }
}
