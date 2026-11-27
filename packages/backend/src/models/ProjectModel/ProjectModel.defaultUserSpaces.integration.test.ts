import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SpaceTableName } from '../../database/entities/spaces';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../testing/migratedDatabase';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { SpaceModel } from '../SpaceModel';
import { ProjectModel } from './ProjectModel';

vi.mock('../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

describe('ProjectModel default user spaces (PostgreSQL)', () => {
    let migrated: MigratedDatabase;
    let projectModel: ProjectModel;
    let spaceModel: SpaceModel;
    let organizationUuid: string;
    let projectId: number;
    let projectUuid: string;
    const user = {
        userId: 0,
        userUuid: randomUUID(),
        firstName: 'Jane',
        lastName: 'Doe',
    };

    // Mirrors UserService.ensureDefaultUserSpaces (what runs on login)
    const login = async () => {
        await projectModel.restoreMissingDefaultUserSpacesParents(
            organizationUuid,
        );
        const projects =
            await projectModel.getProjectsWithDefaultUserSpaces(
                organizationUuid,
            );
        await Promise.all(
            projects.map((project) =>
                projectModel.ensureDefaultUserSpace(
                    project.projectId,
                    project.parentSpaceUuid,
                    project.parentPath,
                    user,
                ),
            ),
        );
    };

    const getSpaces = (deleted: boolean) => {
        const query = migrated
            .database(SpaceTableName)
            .where('project_id', projectId);
        return (
            deleted
                ? query.whereNotNull('deleted_at')
                : query.whereNull('deleted_at')
        ).select<
            {
                space_uuid: string;
                name: string;
                is_default_user_space: boolean;
            }[]
        >('space_uuid', 'name', 'is_default_user_space');
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 4 });
        projectModel = new ProjectModel({
            database: migrated.database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigMock,
            }),
        });
        spaceModel = new SpaceModel({ database: migrated.database });
        const [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: 'Test org' })
            .returning(['organization_id', 'organization_uuid']);
        organizationUuid = organization.organization_uuid;
        const [project] = await migrated
            .database('projects')
            .insert({
                name: 'Default user spaces project',
                organization_id: organization.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                organization_warehouse_credentials_uuid: null,
                created_by_user_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
        projectId = project.project_id;
        projectUuid = project.project_uuid;
        const [createdUser] = await migrated
            .database('users')
            .insert({
                user_uuid: user.userUuid,
                first_name: user.firstName,
                last_name: user.lastName,
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('user_id');
        user.userId = createdUser.user_id;
    });

    beforeEach(async () => {
        await migrated
            .database(SpaceTableName)
            .where('project_id', projectId)
            .delete();
        await projectModel.updateDefaultUserSpaces(projectUuid, true);
        await login();
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('PROD-13173: a login while the folder is in Trash does not block restoring it', async () => {
        const [parent, personal] = [
            (await getSpaces(false)).find((s) => !s.is_default_user_space)!,
            (await getSpaces(false)).find((s) => s.is_default_user_space)!,
        ];
        await spaceModel.softDelete(personal.space_uuid, user.userUuid);
        await spaceModel.softDelete(parent.space_uuid, user.userUuid);

        await login();

        expect(await getSpaces(false)).toEqual([]);

        await spaceModel.restore(parent.space_uuid);
        await spaceModel.restore(personal.space_uuid);

        expect(
            (await getSpaces(false)).map((s) => s.space_uuid).sort(),
        ).toEqual([parent.space_uuid, personal.space_uuid].sort());
        expect(await getSpaces(true)).toEqual([]);
    });

    it('recreates the folder on login after it was renamed', async () => {
        await migrated
            .database(SpaceTableName)
            .where('project_id', projectId)
            .where('is_default_user_space', false)
            .update({ name: 'default user spaces' });
        await migrated
            .database(SpaceTableName)
            .where('project_id', projectId)
            .where('is_default_user_space', true)
            .delete();

        await login();

        const spaces = await getSpaces(false);
        expect(spaces.map((s) => s.name).sort()).toEqual([
            'Default User Spaces',
            'Jane Doe',
            'default user spaces',
        ]);
    });
});
