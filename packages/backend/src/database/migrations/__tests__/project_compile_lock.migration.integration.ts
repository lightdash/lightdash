import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const createProject = async (
    database: Knex,
): Promise<{ projectUuid: string }> => {
    const [{ organization_id: organizationId }] = await database(
        'organizations',
    )
        .insert({ organization_name: `compile lock ${randomUUID()}` })
        .returning('organization_id');
    const [{ project_uuid: projectUuid }] = await database('projects')
        .insert({
            name: 'compile lock test',
            organization_id: organizationId,
            project_type: ProjectType.DEFAULT,
            dbt_connection: null,
            dbt_connection_type: null,
            copied_from_project_uuid: null,
            dbt_version: DefaultSupportedDbtVersion,
            organization_warehouse_credentials_uuid: null,
            created_by_user_uuid: null,
        })
        .returning('project_uuid');
    return { projectUuid };
};

const alterProjectsWithShortLockTimeout = async (database: Knex) => {
    const trx = await database.transaction();
    try {
        await trx.raw("SET LOCAL lock_timeout = '1s'");
        await trx.raw('ALTER TABLE projects ADD COLUMN spk_2353_probe boolean');
    } finally {
        await trx.rollback();
    }
};

describe('project compile lock and migrations that alter projects', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let projectModel: ProjectModel;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigMock,
            }),
        });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    test('a held compile lock does not block an ALTER TABLE projects under lock_timeout', async () => {
        const { projectUuid } = await createProject(database);

        let signalLockAcquired: () => void;
        const lockAcquired = new Promise<void>((resolve) => {
            signalLockAcquired = resolve;
        });
        let releaseLock: () => void;
        const holdLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        const compilePromise = projectModel.tryAcquireProjectLock(
            projectUuid,
            async () => {
                signalLockAcquired();
                await holdLock;
            },
        );

        await lockAcquired;

        try {
            await expect(
                alterProjectsWithShortLockTimeout(database),
            ).resolves.toBeUndefined();
        } finally {
            releaseLock!();
            await compilePromise;
        }
    });
});
