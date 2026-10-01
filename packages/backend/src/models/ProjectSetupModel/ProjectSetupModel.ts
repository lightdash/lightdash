import {
    ForbiddenError,
    getProjectSetupFinish,
    getProjectSetupResumeStep,
    NotFoundError,
    PROJECT_SETUP_STEP_ORDER,
    ProjectSetupStepName,
    ProjectSetupStepStatus,
    type ProjectSetupState,
    type ProjectSetupStep,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbProjectSetup,
    DbProjectSetupStep,
    ProjectSetupsTableName,
    ProjectSetupStepsTableName,
} from '../../database/entities/projectSetups';

type ProjectSetupModelArguments = {
    database: Knex;
};

export const toProjectSetupState = (
    setup: DbProjectSetup,
    stepRows: DbProjectSetupStep[],
): ProjectSetupState => {
    const steps: ProjectSetupStep[] = PROJECT_SETUP_STEP_ORDER.map((name) => {
        const row = stepRows.find((stepRow) => stepRow.step === name);
        if (!row) {
            return {
                step: name,
                status: ProjectSetupStepStatus.NOT_STARTED,
                configurationRevision: null,
                isCurrent: false,
                updatedAt: null,
            };
        }
        return {
            step: name,
            status: row.status,
            configurationRevision: row.configuration_revision,
            isCurrent:
                row.configuration_revision === setup.configuration_revision,
            updatedAt: row.updated_at,
        };
    });
    return {
        projectSetupUuid: setup.project_setup_uuid,
        projectUuid: setup.project_uuid,
        configurationRevision: setup.configuration_revision,
        steps,
        resumeStep: getProjectSetupResumeStep(steps),
        finish: getProjectSetupFinish(steps),
    };
};

export class ProjectSetupModel {
    private database: Knex;

    constructor(args: ProjectSetupModelArguments) {
        this.database = args.database;
    }

    async startAttempt({
        projectSetupUuid,
        organizationUuid,
        userUuid,
    }: {
        projectSetupUuid: string;
        organizationUuid: string;
        userUuid: string | null;
    }): Promise<DbProjectSetup> {
        await this.database(ProjectSetupsTableName)
            .insert({
                project_setup_uuid: projectSetupUuid,
                organization_uuid: organizationUuid,
                created_by_user_uuid: userUuid,
            })
            .onConflict('project_setup_uuid')
            .ignore();
        const setup = await this.database(ProjectSetupsTableName)
            .where('project_setup_uuid', projectSetupUuid)
            .first();
        if (!setup || setup.organization_uuid !== organizationUuid) {
            throw new ForbiddenError(
                'This setup attempt belongs to another organization',
            );
        }
        return setup;
    }

    async findByUuid(projectSetupUuid: string): Promise<DbProjectSetup | null> {
        const setup = await this.database(ProjectSetupsTableName)
            .where('project_setup_uuid', projectSetupUuid)
            .first();
        return setup ?? null;
    }

    async linkProject(
        projectSetupUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const updated = await this.database(ProjectSetupsTableName)
            .where('project_setup_uuid', projectSetupUuid)
            .whereNull('project_uuid')
            .update({ project_uuid: projectUuid, updated_at: new Date() });
        if (updated === 0) {
            throw new NotFoundError(
                'Setup attempt not found or already linked to a project',
            );
        }
    }

    async setStepStatus({
        projectSetupUuid,
        step,
        status,
    }: {
        projectSetupUuid: string;
        step: ProjectSetupStepName;
        status: ProjectSetupStepStatus;
    }): Promise<void> {
        const setup = await this.findByUuid(projectSetupUuid);
        if (!setup) {
            throw new NotFoundError('Setup attempt not found');
        }
        const now = new Date();
        await this.database(ProjectSetupStepsTableName)
            .insert({
                project_setup_uuid: projectSetupUuid,
                step,
                status,
                configuration_revision: setup.configuration_revision,
                updated_at: now,
            })
            .onConflict(['project_setup_uuid', 'step'])
            .merge(['status', 'configuration_revision', 'updated_at']);
        await this.database(ProjectSetupsTableName)
            .where('project_setup_uuid', projectSetupUuid)
            .update({ updated_at: now });
    }

    async setStepStatusForProject({
        projectUuid,
        step,
        status,
    }: {
        projectUuid: string;
        step: ProjectSetupStepName;
        status: ProjectSetupStepStatus;
    }): Promise<boolean> {
        const setup = await this.database(ProjectSetupsTableName)
            .where('project_uuid', projectUuid)
            .first('project_setup_uuid');
        if (!setup) {
            return false;
        }
        await this.setStepStatus({
            projectSetupUuid: setup.project_setup_uuid,
            step,
            status,
        });
        return true;
    }

    async bumpConfigurationRevision(
        projectUuid: string,
        transaction?: Knex.Transaction,
    ): Promise<void> {
        const database = transaction ?? this.database;
        await database(ProjectSetupsTableName)
            .where('project_uuid', projectUuid)
            .increment('configuration_revision', 1);
    }

    async findStateByUuid(
        projectSetupUuid: string,
    ): Promise<ProjectSetupState | null> {
        const setup = await this.findByUuid(projectSetupUuid);
        if (!setup) {
            return null;
        }
        const steps = await this.database(ProjectSetupStepsTableName).where(
            'project_setup_uuid',
            projectSetupUuid,
        );
        return toProjectSetupState(setup, steps);
    }

    async findStateByProjectUuid(
        projectUuid: string,
    ): Promise<ProjectSetupState | null> {
        const setup = await this.database(ProjectSetupsTableName)
            .where('project_uuid', projectUuid)
            .first();
        if (!setup) {
            return null;
        }
        const steps = await this.database(ProjectSetupStepsTableName).where(
            'project_setup_uuid',
            setup.project_setup_uuid,
        );
        return toProjectSetupState(setup, steps);
    }
}
