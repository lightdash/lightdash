import {
    type ProjectSetupStepName,
    type ProjectSetupStepStatus,
} from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectSetupsTableName = 'project_setups';
export const ProjectSetupStepsTableName = 'project_setup_steps';

export type DbProjectSetup = {
    project_setup_uuid: string;
    organization_uuid: string;
    project_uuid: string | null;
    created_by_user_uuid: string | null;
    configuration_revision: number;
    created_at: Date;
    updated_at: Date;
};

export type ProjectSetupsTable = Knex.CompositeTableType<
    DbProjectSetup,
    Pick<
        DbProjectSetup,
        'project_setup_uuid' | 'organization_uuid' | 'created_by_user_uuid'
    >,
    Partial<
        Pick<
            DbProjectSetup,
            'project_uuid' | 'configuration_revision' | 'updated_at'
        >
    >
>;

export type DbProjectSetupStep = {
    project_setup_uuid: string;
    step: ProjectSetupStepName;
    status: ProjectSetupStepStatus;
    configuration_revision: number;
    updated_at: Date;
};

export type ProjectSetupStepsTable = Knex.CompositeTableType<
    DbProjectSetupStep,
    Omit<DbProjectSetupStep, 'updated_at'> & { updated_at?: Date },
    Partial<
        Pick<
            DbProjectSetupStep,
            'status' | 'configuration_revision' | 'updated_at'
        >
    >
>;
