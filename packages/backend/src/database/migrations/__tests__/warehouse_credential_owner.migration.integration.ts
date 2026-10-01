import {
    BigqueryAuthenticationType,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    PersonSignInProvider,
    ProjectType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

const SECRET = 'warehouse-credential-owner-test-secret';

const googleSignIn = (refreshToken: string): CreateBigqueryCredentials => ({
    type: WarehouseTypes.BIGQUERY,
    project: 'analytics',
    dataset: 'marts',
    authenticationType: BigqueryAuthenticationType.SSO,
    keyfileContents: {
        type: 'authorized_user',
        client_id: 'client',
        client_secret: 'secret',
        refresh_token: refreshToken,
    },
    location: undefined,
    timeoutSeconds: 300,
    priority: 'interactive',
    retries: 3,
    maximumBytesBilled: undefined,
});

const serviceAccount: CreateBigqueryCredentials = {
    ...googleSignIn('unused'),
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: { type: 'service_account', private_key: 'key' },
};

describe('warehouse credential owner', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let model: ProjectModel;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase(
            'warehouse_credential_owner',
        );
        database = migrated.database;
        model = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: {
                    lightdashSecret: SECRET,
                    lightdashSecrets: {
                        active: SECRET,
                        fallbacks: [],
                        all: [SECRET],
                    },
                },
            } as never),
        });
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    const createUser = async (firstName: string) =>
        (
            await database('users')
                .insert({ first_name: firstName, last_name: 'Person' } as never)
                .returning('user_uuid')
        )[0].user_uuid as string;

    const createOrganization = async () =>
        (
            await database('organizations')
                .insert({ organization_name: 'Owner test' })
                .returning('organization_uuid')
        )[0].organization_uuid as string;

    const projectData = (
        warehouseConnection: CreateWarehouseCredentials,
        extra: Partial<{ type: ProjectType; upstreamProjectUuid: string }> = {},
    ) => ({
        name: 'Owner project',
        type: ProjectType.DEFAULT,
        dbtConnection: { type: DbtProjectType.NONE } as never,
        dbtVersion: DefaultSupportedDbtVersion,
        warehouseConnection,
        ...extra,
    });

    const storedOwner = async (projectUuid: string) =>
        (
            await database('warehouse_credentials')
                .innerJoin(
                    'projects',
                    'projects.project_id',
                    'warehouse_credentials.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .first<{ credential_owner_user_uuid: string | null }>(
                    'warehouse_credentials.credential_owner_user_uuid',
                )
        )?.credential_owner_user_uuid ?? null;

    test('records the person who saves a sign-in, and reads back their name', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        expect(await storedOwner(projectUuid)).toBe(founder);
        expect(await model.getSharedCredentialOwner(projectUuid)).toEqual({
            signIn: PersonSignInProvider.GOOGLE,
            owner: { userUuid: founder, name: 'Fran Person' },
        });
    });

    test('keeps the owner when someone else saves the same sign-in, and moves it with a new one', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const admin = await createUser('Ada');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        await model.update(
            projectUuid,
            projectData(googleSignIn('founder-token')),
            admin,
        );
        expect(await storedOwner(projectUuid)).toBe(founder);

        await model.update(
            projectUuid,
            projectData(googleSignIn('admin-token')),
            admin,
        );
        expect(await storedOwner(projectUuid)).toBe(admin);
    });

    test('clears the owner and the badge when a service account replaces the sign-in', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        await model.update(projectUuid, projectData(serviceAccount), founder);

        expect(await storedOwner(projectUuid)).toBeNull();
        expect(await model.getSharedCredentialOwner(projectUuid)).toBeNull();
    });

    test("gives a preview that copies its parent's sign-in the parent's owner", async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const developer = await createUser('Dev');
        const parent = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        const copy = await model.create(
            developer,
            organization,
            projectData(googleSignIn('founder-token'), {
                type: ProjectType.PREVIEW,
                upstreamProjectUuid: parent,
            }),
        );
        const own = await model.create(
            developer,
            organization,
            projectData(googleSignIn('developer-token'), {
                type: ProjectType.PREVIEW,
                upstreamProjectUuid: parent,
            }),
        );

        expect(await storedOwner(copy)).toBe(founder);
        expect(await storedOwner(own)).toBe(developer);
    });

    test('shows the sign-in without a name once the owner is deleted', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        await database('users').where('user_uuid', founder).delete();

        expect(await model.getSharedCredentialOwner(projectUuid)).toEqual({
            signIn: PersonSignInProvider.GOOGLE,
            owner: null,
        });
    });
});
