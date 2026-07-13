import {
    OnboardingProjectStep,
    OnboardingStepStatus,
    OnboardingStepType,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbOnboardingProjectState,
    OnboardingProjectStateTableName,
} from '../database/entities/onboardingProjectState';

type OnboardingProjectStateModelArguments = {
    database: Knex;
};

export class OnboardingProjectStateModel {
    private readonly database: Knex;

    constructor({ database }: OnboardingProjectStateModelArguments) {
        this.database = database;
    }

    private static convertRow(
        row: DbOnboardingProjectState,
    ): OnboardingProjectStep {
        return {
            step: row.step,
            status: row.status,
            result: row.result,
            updatedAt: row.updated_at,
        };
    }

    async getAll(projectUuid: string): Promise<OnboardingProjectStep[]> {
        const rows = await this.database(OnboardingProjectStateTableName)
            .where('project_uuid', projectUuid)
            .orderBy('created_at', 'asc');
        return rows.map(OnboardingProjectStateModel.convertRow);
    }

    async find(
        projectUuid: string,
        step: OnboardingStepType,
    ): Promise<OnboardingProjectStep | undefined> {
        const row = await this.database(OnboardingProjectStateTableName)
            .where('project_uuid', projectUuid)
            .andWhere('step', step)
            .first();
        return row ? OnboardingProjectStateModel.convertRow(row) : undefined;
    }

    async upsert(
        projectUuid: string,
        step: OnboardingStepType,
        status: OnboardingStepStatus,
        result: Record<string, unknown> | null,
    ): Promise<OnboardingProjectStep> {
        const serializedResult =
            result === null ? null : JSON.stringify(result);
        const [row] = await this.database(OnboardingProjectStateTableName)
            .insert({
                project_uuid: projectUuid,
                step,
                status,
                result: serializedResult,
            })
            .onConflict(['project_uuid', 'step'])
            .merge({
                status,
                result: serializedResult,
                updated_at: this.database.fn.now(),
            })
            .returning('*');
        return OnboardingProjectStateModel.convertRow(row);
    }
}
