import {
    BigqueryAuthenticationType,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    OrganizationMemberRole,
    PersonSignInProvider,
    ProjectType,
    SignInSubjectBasis,
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

const SECRET = 'warehouse-credential-subject-test-secret';

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

describe('warehouse credential subject', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let model: ProjectModel;
    let encryptionUtil: EncryptionUtil;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase(
            'warehouse_credential_subject',
        );
        database = migrated.database;
        encryptionUtil = new EncryptionUtil({
            lightdashConfig: {
                lightdashSecret: SECRET,
                lightdashSecrets: {
                    active: SECRET,
                    fallbacks: [],
                    all: [SECRET],
                },
            },
        } as never);
        model = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil,
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
                .insert({ organization_name: 'Sign-in subject test' })
                .returning('organization_uuid')
        )[0].organization_uuid as string;

    const projectData = (
        warehouseConnection: CreateWarehouseCredentials,
        extra: Partial<{ type: ProjectType; upstreamProjectUuid: string }> = {},
    ) => ({
        name: 'Sign-in subject project',
        type: ProjectType.DEFAULT,
        dbtConnection: { type: DbtProjectType.NONE } as never,
        dbtVersion: DefaultSupportedDbtVersion,
        warehouseConnection,
        ...extra,
    });

    const storedSubject = async (projectUuid: string) =>
        (
            await database('warehouse_credentials')
                .innerJoin(
                    'projects',
                    'projects.project_id',
                    'warehouse_credentials.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .first<{ credential_subject_user_uuid: string | null }>(
                    'warehouse_credentials.credential_subject_user_uuid',
                )
        )?.credential_subject_user_uuid ?? null;

    const addMemberWithGoogleToken = async (
        organizationUuid: string,
        userUuid: string,
        token: string,
    ) => {
        const organization = await database('organizations')
            .where('organization_uuid', organizationUuid)
            .first('organization_id');
        const user = await database('users')
            .where('user_uuid', userUuid)
            .first('user_id');
        await database('organization_memberships').insert({
            organization_id: organization!.organization_id,
            user_id: user!.user_id,
            role: OrganizationMemberRole.ADMIN,
        } as never);
        await database('user_oauth_grants').insert({
            user_uuid: userUuid,
            provider: 'google',
            provider_subject: userUuid,
            provider_email: `${userUuid}@example.com`,
            scopes: [],
            encrypted_refresh_token: encryptionUtil.encrypt(token),
        } as never);
    };

    test('records whose sign-in it is when someone saves it, and reads back their name', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        expect(await storedSubject(projectUuid)).toBe(founder);
        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'founder-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: founder, name: 'Fran Person' },
            basis: SignInSubjectBasis.RECORDED,
        });
    });

    test('keeps the subject when someone else saves the same sign-in, and moves it with a new one', async () => {
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
        expect(await storedSubject(projectUuid)).toBe(founder);

        await model.update(
            projectUuid,
            projectData(googleSignIn('admin-token')),
            admin,
        );
        expect(await storedSubject(projectUuid)).toBe(admin);
    });

    test('leaves a legacy subject unknown when an admin saves the same token', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const admin = await createUser('Ada');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('legacy-save-token')),
        );
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        await model.update(
            projectUuid,
            projectData(googleSignIn('legacy-save-token')),
            admin,
        );

        expect(await storedSubject(projectUuid)).toBeNull();
    });

    test('clears the subject and the warning when a service account replaces the sign-in', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        await model.update(projectUuid, projectData(serviceAccount), founder);

        expect(await storedSubject(projectUuid)).toBeNull();
        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'founder-token',
            ),
        ).toBeNull();
    });

    test("gives a preview that copies its parent's sign-in the parent's subject", async () => {
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

        expect(await storedSubject(copy)).toBe(founder);
        expect(await storedSubject(own)).toBe(developer);

        await model.updateWarehouseCredentialsIf(own, () =>
            googleSignIn('founder-token'),
        );
        expect(await storedSubject(own)).toBe(founder);
    });

    test('leaves a preview subject unknown when it copies a legacy parent token', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const developer = await createUser('Dev');
        const parent = await model.create(
            founder,
            organization,
            projectData(googleSignIn('legacy-preview-token')),
        );
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', parent)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        const preview = await model.create(
            developer,
            organization,
            projectData(googleSignIn('legacy-preview-token'), {
                type: ProjectType.PREVIEW,
                upstreamProjectUuid: parent,
            }),
        );

        expect(await storedSubject(preview)).toBeNull();
    });

    test('shows the sign-in without a name once its subject is deleted', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('founder-token')),
        );

        await database('users').where('user_uuid', founder).delete();

        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'founder-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: null,
            basis: null,
        });
    });

    test('resolves and stores a unique legacy Google subject', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('legacy-token')),
        );
        await addMemberWithGoogleToken(organization, founder, 'legacy-token');
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'legacy-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: founder, name: 'Fran Person' },
            basis: SignInSubjectBasis.RECORDED,
        });
        expect(await storedSubject(projectUuid)).toBe(founder);
    });

    test('uses the project creator when a legacy token no longer matches a grant', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('legacy-token')),
        );
        await addMemberWithGoogleToken(organization, founder, 'new-token');
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'legacy-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: founder, name: 'Fran Person' },
            basis: SignInSubjectBasis.PROJECT_CREATOR,
        });
        expect(await storedSubject(projectUuid)).toBeNull();
    });

    test('does not use the project creator after they leave the organization', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('legacy-token')),
        );
        await addMemberWithGoogleToken(organization, founder, 'new-token');
        await database('organization_memberships')
            .whereIn(
                'user_id',
                database('users').where('user_uuid', founder).select('user_id'),
            )
            .delete();
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'legacy-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: null,
            basis: null,
        });
        expect(await storedSubject(projectUuid)).toBeNull();
    });

    test('prefers an exact grant match over the project creator', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const teammate = await createUser('Ada');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('legacy-token')),
        );
        await addMemberWithGoogleToken(organization, founder, 'new-token');
        await addMemberWithGoogleToken(organization, teammate, 'legacy-token');
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'legacy-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: teammate, name: 'Ada Person' },
            basis: SignInSubjectBasis.RECORDED,
        });
        expect(await storedSubject(projectUuid)).toBe(teammate);
    });

    test('resolves a legacy Google token from an OpenID identity', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('openid-token')),
        );
        const organizationRow = await database('organizations')
            .where('organization_uuid', organization)
            .first('organization_id');
        const user = await database('users')
            .where('user_uuid', founder)
            .first('user_id');
        await database('organization_memberships').insert({
            organization_id: organizationRow!.organization_id,
            user_id: user!.user_id,
            role: OrganizationMemberRole.ADMIN,
        } as never);
        await database('openid_identities').insert({
            user_id: user!.user_id,
            issuer: 'https://accounts.google.com',
            issuer_type: 'google',
            subject: founder,
            email: `${founder}@example.com`,
            refresh_token: 'openid-token',
        } as never);
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'openid-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: founder, name: 'Fran Person' },
            basis: SignInSubjectBasis.RECORDED,
        });
        expect(await storedSubject(projectUuid)).toBe(founder);
    });

    test('uses the creator without recording a guess when two members share a legacy token', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const teammate = await createUser('Ada');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('shared-legacy-token')),
        );
        await addMemberWithGoogleToken(
            organization,
            founder,
            'shared-legacy-token',
        );
        await addMemberWithGoogleToken(
            organization,
            teammate,
            'shared-legacy-token',
        );
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'shared-legacy-token',
            ),
        ).toEqual({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: founder, name: 'Fran Person' },
            basis: SignInSubjectBasis.PROJECT_CREATOR,
        });
        expect(await storedSubject(projectUuid)).toBeNull();
        expect(
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'different-token',
            ),
        ).toBeNull();
    });

    test('coalesces concurrent unresolved legacy lookups and caches the result', async () => {
        const organization = await createOrganization();
        const founder = await createUser('Fran');
        const projectUuid = await model.create(
            founder,
            organization,
            projectData(googleSignIn('unresolved-concurrent-token')),
        );
        await database('warehouse_credentials')
            .whereIn(
                'project_id',
                database('projects')
                    .where('project_uuid', projectUuid)
                    .select('project_id'),
            )
            .update({ credential_subject_user_uuid: null });

        let memberScans = 0;
        const countMemberScans = ({ sql }: { sql: string }) => {
            if (
                sql
                    .replaceAll('"', '')
                    .includes('user_oauth_grants.encrypted_refresh_token')
            ) {
                memberScans += 1;
            }
        };
        database.on('query', countMemberScans);
        try {
            const [first, second] = await Promise.all([
                model.getSharedSignInSubjectForToken(
                    projectUuid,
                    'unresolved-concurrent-token',
                ),
                model.getSharedSignInSubjectForToken(
                    projectUuid,
                    'unresolved-concurrent-token',
                ),
            ]);
            expect(first).toEqual(second);
            await model.getSharedSignInSubjectForToken(
                projectUuid,
                'unresolved-concurrent-token',
            );
            expect(memberScans).toBe(1);
        } finally {
            database.off('query', countMemberScans);
        }
    });
});
