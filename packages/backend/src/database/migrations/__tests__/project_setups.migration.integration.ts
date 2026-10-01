import {
    DefaultSupportedDbtVersion,
    ForbiddenError,
    ProjectSetupStepName,
    ProjectSetupStepStatus,
    ProjectType,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ProjectSetupModel } from '../../../models/ProjectSetupModel/ProjectSetupModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

const createOrganization = async (database: Knex): Promise<string> => {
    const [{ organization_uuid: organizationUuid }] = await database(
        'organizations',
    )
        .insert({ organization_name: `project setup ${randomUUID()}` })
        .returning('organization_uuid');
    return organizationUuid;
};

const createProject = async (
    database: Knex,
    organizationUuid: string,
): Promise<string> => {
    const organization = await database('organizations')
        .where('organization_uuid', organizationUuid)
        .first('organization_id');
    if (!organization) {
        throw new Error('Organization not found');
    }
    const [{ project_uuid: projectUuid }] = await database('projects')
        .insert({
            name: 'project setup test',
            organization_id: organization.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_connection: null,
            dbt_connection_type: null,
            copied_from_project_uuid: null,
            dbt_version: DefaultSupportedDbtVersion,
            organization_warehouse_credentials_uuid: null,
            created_by_user_uuid: null,
        })
        .returning('project_uuid');
    return projectUuid;
};

describe('project setup state on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: ProjectSetupModel;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        model = new ProjectSetupModel({ database });
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    test('starting the same attempt twice keeps one row', async () => {
        const organizationUuid = await createOrganization(database);
        const projectSetupUuid = randomUUID();

        await model.startAttempt({
            projectSetupUuid,
            organizationUuid,
            userUuid: null,
        });
        await model.startAttempt({
            projectSetupUuid,
            organizationUuid,
            userUuid: null,
        });

        const rows = await database('project_setups').where(
            'project_setup_uuid',
            projectSetupUuid,
        );
        expect(rows).toHaveLength(1);
    });

    test('an attempt id from another organization is refused', async () => {
        const firstOrganizationUuid = await createOrganization(database);
        const secondOrganizationUuid = await createOrganization(database);
        const projectSetupUuid = randomUUID();
        await model.startAttempt({
            projectSetupUuid,
            organizationUuid: firstOrganizationUuid,
            userUuid: null,
        });

        await expect(
            model.startAttempt({
                projectSetupUuid,
                organizationUuid: secondOrganizationUuid,
                userUuid: null,
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    test('steps record the revision they ran on and go stale on a bump', async () => {
        const organizationUuid = await createOrganization(database);
        const projectUuid = await createProject(database, organizationUuid);
        const projectSetupUuid = randomUUID();
        await model.startAttempt({
            projectSetupUuid,
            organizationUuid,
            userUuid: null,
        });
        await model.linkProject(projectSetupUuid, projectUuid);
        await model.setStepStatus({
            projectSetupUuid,
            step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
            status: ProjectSetupStepStatus.SUCCEEDED,
        });

        await model.bumpConfigurationRevision(projectUuid);
        await model.setStepStatusForProject({
            projectUuid,
            step: ProjectSetupStepName.SEMANTIC_LAYER,
            status: ProjectSetupStepStatus.PARTIAL,
        });

        const state = await model.findStateByProjectUuid(projectUuid);
        expect(state?.configurationRevision).toBe(2);
        expect(
            state?.steps.map(({ step, status, isCurrent }) => ({
                step,
                status,
                isCurrent,
            })),
        ).toEqual([
            {
                step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
                status: ProjectSetupStepStatus.SUCCEEDED,
                isCurrent: false,
            },
            {
                step: ProjectSetupStepName.SEMANTIC_LAYER,
                status: ProjectSetupStepStatus.PARTIAL,
                isCurrent: true,
            },
        ]);
        expect(state?.resumeStep).toBe(ProjectSetupStepName.SEMANTIC_LAYER);
    });

    test('a project can be linked to only one attempt', async () => {
        const organizationUuid = await createOrganization(database);
        const projectUuid = await createProject(database, organizationUuid);
        const firstAttemptUuid = randomUUID();
        const secondAttemptUuid = randomUUID();
        await model.startAttempt({
            projectSetupUuid: firstAttemptUuid,
            organizationUuid,
            userUuid: null,
        });
        await model.startAttempt({
            projectSetupUuid: secondAttemptUuid,
            organizationUuid,
            userUuid: null,
        });
        await model.linkProject(firstAttemptUuid, projectUuid);

        await expect(
            model.linkProject(secondAttemptUuid, projectUuid),
        ).rejects.toThrow();
    });

    test('deleting the project deletes its setup state', async () => {
        const organizationUuid = await createOrganization(database);
        const projectUuid = await createProject(database, organizationUuid);
        const projectSetupUuid = randomUUID();
        await model.startAttempt({
            projectSetupUuid,
            organizationUuid,
            userUuid: null,
        });
        await model.linkProject(projectSetupUuid, projectUuid);
        await model.setStepStatus({
            projectSetupUuid,
            step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
            status: ProjectSetupStepStatus.SUCCEEDED,
        });

        await database('projects').where('project_uuid', projectUuid).delete();

        expect(await model.findByUuid(projectSetupUuid)).toBeNull();
        expect(
            await database('project_setup_steps').where(
                'project_setup_uuid',
                projectSetupUuid,
            ),
        ).toHaveLength(0);
    });
});
