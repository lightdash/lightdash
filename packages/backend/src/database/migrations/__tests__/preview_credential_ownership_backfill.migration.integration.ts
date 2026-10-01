import {
    BigqueryAuthenticationType,
    ProjectType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { backfillPreviewCredentialOwnership } from '../../../scripts/backfill-preview-credential-ownership/backfill';
import { runBackfillCli } from '../../../scripts/backfill-preview-credential-ownership/cli';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

const SECRET = 'preview-credential-ownership-backfill-test-secret';
const CLIENT_SECRET = 'oauth-client-secret-value';

const bigquerySso = (refreshToken: string): CreateBigqueryCredentials => ({
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    project: 'analytics',
    dataset: 'prod',
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
    keyfileContents: {
        type: 'authorized_user',
        client_id: 'lightdash-client',
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
    },
});

const bigqueryPrivateKey: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    project: 'analytics',
    dataset: 'prod',
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
    keyfileContents: {
        type: 'service_account',
        private_key: 'private-key-value',
        client_email: 'robot@analytics.iam.gserviceaccount.com',
    },
};

describe('preview credential ownership backfill', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let encryptionUtil: EncryptionUtil;
    let organizationId: number;
    let organizationUuid: string;

    const encrypt = (credentials: CreateWarehouseCredentials) =>
        encryptionUtil.encrypt(JSON.stringify(credentials));

    const createProject = async ({
        credentials,
        type = ProjectType.DEFAULT,
        upstreamProjectUuid = null,
        previewOwnsCredentials = null,
        organizationWarehouseCredentialsUuid = null,
    }: {
        credentials: CreateWarehouseCredentials;
        type?: ProjectType;
        upstreamProjectUuid?: string | null;
        previewOwnsCredentials?: boolean | null;
        organizationWarehouseCredentialsUuid?: string | null;
    }) => {
        const [project] = await database('projects')
            .insert({
                name: `Project ${Math.random()}`,
                organization_id: organizationId,
                project_type: type,
                copied_from_project_uuid: upstreamProjectUuid,
                organization_warehouse_credentials_uuid:
                    organizationWarehouseCredentialsUuid,
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: credentials.type,
            encrypted_credentials: encrypt(credentials),
            preview_owns_credentials: previewOwnsCredentials,
        } as never);
        return project.project_uuid as string;
    };

    const ownershipOf = async (projectUuid: string) =>
        (
            await database('warehouse_credentials')
                .innerJoin(
                    'projects',
                    'projects.project_id',
                    'warehouse_credentials.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .first('warehouse_credentials.preview_owns_credentials')
        ).preview_owns_credentials as boolean | null;

    const createPreview = (
        upstreamProjectUuid: string | null,
        credentials: CreateWarehouseCredentials,
        previewOwnsCredentials: boolean | null = null,
    ) =>
        createProject({
            credentials,
            type: ProjectType.PREVIEW,
            upstreamProjectUuid,
            previewOwnsCredentials,
        });

    let previews: Record<string, string>;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase(
            'preview_credential_ownership_backfill',
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
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Backfill test' })
            .returning(['organization_id', 'organization_uuid']);
        organizationId = organization.organization_id;
        organizationUuid = organization.organization_uuid;

        const upstream = await createProject({
            credentials: bigquerySso('parent-token'),
        });
        const [organizationCredentials] = await database(
            'organization_warehouse_credentials',
        )
            .insert({
                organization_uuid: organizationUuid,
                name: 'Shared',
                warehouse_type: WarehouseTypes.BIGQUERY,
                warehouse_connection: encrypt(bigquerySso('shared-token')),
            } as never)
            .returning('organization_warehouse_credentials_uuid');

        previews = {
            copy: await createPreview(upstream, bigquerySso('parent-token')),
            ownSignIn: await createPreview(upstream, bigquerySso('own-token')),
            staleCopy: await createPreview(
                upstream,
                bigquerySso('old-parent-token'),
            ),
            deletedParent: await createPreview(
                null,
                bigquerySso('orphan-token'),
            ),
            recordedOwned: await createPreview(
                upstream,
                bigquerySso('parent-token'),
                true,
            ),
            recordedCopy: await createPreview(
                upstream,
                bigquerySso('another-token'),
                false,
            ),
            privateKey: await createPreview(upstream, bigqueryPrivateKey),
            organizationCredentials: await createProject({
                credentials: bigquerySso('shared-token'),
                type: ProjectType.PREVIEW,
                upstreamProjectUuid: upstream,
                organizationWarehouseCredentialsUuid:
                    organizationCredentials.organization_warehouse_credentials_uuid,
            }),
        };
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    const ownerships = async () =>
        Object.fromEntries(
            await Promise.all(
                Object.entries(previews).map(
                    async ([name, projectUuid]) =>
                        [name, await ownershipOf(projectUuid)] as const,
                ),
            ),
        );

    const context = () => ({ database, encryptionUtil });

    test('a dry run classifies previews and writes nothing', async () => {
        const before = await ownerships();

        await expect(
            backfillPreviewCredentialOwnership(context(), {
                execute: false,
                batchSize: 2,
            }),
        ).resolves.toEqual({
            mode: 'dry-run',
            scanned: 5,
            copies: 1,
            owned: 3,
            notBigquerySso: 1,
            unreadable: 0,
            updated: 0,
            concurrentSkips: 0,
        });
        expect(await ownerships()).toEqual(before);
    });

    test('execute records a copy as false, an ambiguous token as owned, and never overwrites', async () => {
        const report = await backfillPreviewCredentialOwnership(context(), {
            execute: true,
            batchSize: 2,
        });

        expect(report).toMatchObject({ copies: 1, owned: 3, updated: 4 });
        expect(await ownerships()).toEqual({
            copy: false,
            ownSignIn: true,
            staleCopy: true,
            deletedParent: true,
            recordedOwned: true,
            recordedCopy: false,
            privateKey: null,
            organizationCredentials: null,
        });
    });

    test('a second run changes nothing', async () => {
        const before = await ownerships();

        await expect(
            backfillPreviewCredentialOwnership(context(), {
                execute: true,
                batchSize: 2,
            }),
        ).resolves.toEqual({
            mode: 'execute',
            scanned: 1,
            copies: 0,
            owned: 0,
            notBigquerySso: 1,
            unreadable: 0,
            updated: 0,
            concurrentSkips: 0,
        });
        expect(await ownerships()).toEqual(before);
    });

    test.each([
        {
            change: 'a new credential',
            write: () => ({
                encrypted_credentials: encrypt(bigquerySso('saved-during-run')),
            }),
            expectedOwnership: null,
        },
        {
            change: 'a recorded ownership',
            write: () => ({ preview_owns_credentials: true }),
            expectedOwnership: true,
        },
    ])(
        '$change saved during the run is never overwritten',
        async ({ write, expectedOwnership }) => {
            const preview = await createPreview(
                await createProject({ credentials: bigquerySso('parent-2') }),
                bigquerySso('parent-2'),
            );
            const saveOnPreview = () =>
                database('warehouse_credentials')
                    .update(write())
                    .whereIn(
                        'project_id',
                        database('projects')
                            .select('project_id')
                            .where('project_uuid', preview),
                    );
            const racingDatabase = ((table: string) => {
                const query = database(table);
                if (table !== 'warehouse_credentials') return query;
                const run = query.then.bind(query);
                return Object.assign(query, {
                    then: (
                        onFulfilled: Parameters<typeof run>[0],
                        onRejected: Parameters<typeof run>[1],
                    ) =>
                        saveOnPreview().then(() =>
                            run(onFulfilled, onRejected),
                        ),
                });
            }) as unknown as Knex;

            const report = await backfillPreviewCredentialOwnership(
                { database: racingDatabase, encryptionUtil },
                { execute: true, batchSize: 500 },
            );

            expect(report).toMatchObject({ copies: 1, concurrentSkips: 1 });
            expect(await ownershipOf(preview)).toBe(expectedOwnership);
        },
    );

    test('the command logs counts and never a token', async () => {
        const lines: string[] = [];
        await createPreview(
            await createProject({ credentials: bigquerySso('parent-3') }),
            bigquerySso('preview-3'),
        );

        const exitCode = await runBackfillCli(
            ['--execute'],
            context(),
            (line) => lines.push(line),
        );

        expect(exitCode).toBe(0);
        const output = lines.join('\n');
        expect(output).toContain('owned=');
        [
            'parent-token',
            'own-token',
            'old-parent-token',
            'parent-3',
            'preview-3',
            'saved-during-run',
            CLIENT_SECRET,
            'private-key-value',
        ].forEach((secret) => expect(output).not.toContain(secret));
    });
});
