import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    ContentType,
    DefaultSupportedDbtVersion,
    ProjectType,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AppGenerateService } from '../../../ee/services/AppGenerateService/AppGenerateService';
import * as auditLogger from '../../../logging/winston';
import { AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { AppModel } from '../../../models/AppModel';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { DocumentModel } from '../../../models/DocumentModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../../../services/AiAccessService/agentExecutionContext';
import { DocumentService } from '../../../services/DocumentService/DocumentService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

vi.mock('../../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

const scenarios = [
    { agent: true, enabled: true, verified: true },
    { agent: true, enabled: true, verified: false },
    { agent: true, enabled: false, verified: true },
    { agent: false, enabled: true, verified: true },
];

describe('implicit agent unverification with persisted rows', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
    });
    afterAll(async () => migrated?.destroy());
    afterEach(() => vi.restoreAllMocks());

    const setup = async (enabled: boolean) => {
        const [org] = await database('organizations')
            .insert({ organization_name: 'Unverification tests' })
            .returning(['organization_id', 'organization_uuid']);
        const users = await database('users')
            .insert(
                ['Editor', 'Verifier'].map((firstName) => ({
                    first_name: firstName,
                    last_name: 'Test',
                    is_active: true,
                    is_marketing_opted_in: false,
                    is_setup_complete: true,
                    is_tracking_anonymized: false,
                })),
            )
            .returning('user_uuid');
        const organizationUuid = org.organization_uuid;
        const userUuid = users[0].user_uuid;
        const verifierUuid = users[1].user_uuid;
        const [project] = await database('projects')
            .insert({
                name: 'Verification',
                organization_id: org.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
        const projectUuid = project.project_uuid;
        const [space] = await database('spaces')
            .insert({
                name: 'Reports',
                slug: 'reports',
                path: 'reports',
                project_id: project.project_id,
                parent_space_uuid: null,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })
            .returning('space_uuid');
        const spaceUuid = space.space_uuid;
        const ability = new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'all' },
            {
                action: 'manage',
                subject: 'ContentVerification',
                inverted: true,
            },
        ]);
        const user = {
            ...defaultSessionUser,
            userUuid,
            organizationUuid,
            ability,
            abilityRules: ability.rules,
        };
        const account = fromSession(user);
        const scope = createAgentExecutionContext({
            account,
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: 'lightdash-chat',
            agentUuid: randomUUID(),
            agentIdentityEnabled: enabled,
        });
        const contentVerificationModel = new ContentVerificationModel({
            database,
        });
        const agentActionLogModel = new AgentActionLogModel({ database });
        const documentModel = new DocumentModel({ database });
        const appModel = new AppModel({ database });
        const dependencies = {
            agentActionLogModel,
            contentVerificationModel,
            documentModel,
            appModel,
            lightdashConfig: lightdashConfigMock,
            analytics: { track: vi.fn() },
            aiCreditService: {
                assertAiCreditsAvailable: async () => undefined,
            },
            featureFlagModel: { get: async () => ({ enabled: true }) },
            projectModel: {
                getSummary: async () => ({
                    organizationUuid,
                    projectUuid,
                    type: ProjectType.DEFAULT,
                    createdByUserUuid: userUuid,
                    upstreamProjectUuid: null,
                }),
            },
            spacePermissionService: {
                resolveAccess: async () => ({
                    organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject: true,
                    access: [],
                    admins: [],
                    directOnly: false,
                }),
            },
            orgAiCopilotConfigResolver: {
                getDataAppModelVisibility: async () => null,
            },
            schedulerClient: { appGeneratePipeline: vi.fn() },
        };
        const documentService = new DocumentService(
            dependencies as unknown as ConstructorParameters<
                typeof DocumentService
            >[0],
        );
        const appService = new AppGenerateService(
            dependencies as unknown as ConstructorParameters<
                typeof AppGenerateService
            >[0],
        );
        return {
            user,
            account,
            scope,
            projectUuid,
            spaceUuid,
            verifierUuid,
            contentVerificationModel,
            agentActionLogModel,
            schedulerClient: dependencies.schedulerClient,
            documentModel,
            appModel,
            documentService,
            appService,
        };
    };

    test('rolls back initial Document and version when the ledger insert fails', async () => {
        const {
            account,
            scope,
            projectUuid,
            spaceUuid,
            documentService,
            agentActionLogModel,
        } = await setup(true);
        const insert = vi
            .spyOn(agentActionLogModel, 'insert')
            .mockRejectedValueOnce(new Error('ledger unavailable'));
        const audit = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => {});
        await expect(
            agentExecutionContext.run(scope, () =>
                documentService.create(account, projectUuid, {
                    name: 'Uncommitted document',
                    description: '',
                    spaceUuid,
                    schemaVersion: 2,
                    content: { markdown: '# Never committed', charts: {} },
                }),
            ),
        ).rejects.toThrow('ledger unavailable');
        expect(insert).toHaveBeenCalledTimes(1);
        const [entry, transaction] = insert.mock.calls[0];
        expect(transaction).toBeDefined();
        expect(entry).toMatchObject({
            agent_identity: scope.claim,
            action: 'create',
            object_type: 'document',
        });
        expect(
            await database('documents').where('project_uuid', projectUuid),
        ).toEqual([]);
        expect(
            await database('document_versions').where(
                'document_version_uuid',
                entry.version_uuid!,
            ),
        ).toEqual([]);
        expect(
            await database('agent_action_log').where(
                'project_uuid',
                projectUuid,
            ),
        ).toEqual([]);
        expect(audit).not.toHaveBeenCalledWith(
            expect.objectContaining({
                resource: expect.objectContaining({
                    metadata: expect.objectContaining({
                        event: 'agent_content.write',
                    }),
                }),
            }),
        );
    });

    test('rolls back Document content and version and keeps verification on ledger failure', async () => {
        const {
            account,
            user,
            scope,
            projectUuid,
            spaceUuid,
            verifierUuid,
            documentModel,
            documentService,
            contentVerificationModel,
            agentActionLogModel,
        } = await setup(true);
        const document = await documentModel.create({
            projectUuid,
            spaceUuid,
            name: 'Verified document',
            description: '',
            content: { markdown: '# Original', charts: {} },
            createdByUserUuid: user.userUuid,
        });
        await contentVerificationModel.verify(
            ContentType.DOCUMENT,
            document.documentUuid,
            projectUuid,
            verifierUuid,
        );
        const before = await documentModel.get(
            projectUuid,
            document.documentUuid,
        );
        const rawBefore = await database('documents')
            .where('document_uuid', document.documentUuid)
            .first();
        if (!rawBefore) throw new Error('Expected persisted document');
        const versionsBefore = await database('document_versions').where(
            'document_id',
            rawBefore.document_id,
        );
        const verificationBefore = await contentVerificationModel.getByContent(
            ContentType.DOCUMENT,
            document.documentUuid,
        );
        const insert = vi
            .spyOn(agentActionLogModel, 'insert')
            .mockRejectedValueOnce(new Error('ledger unavailable'));
        await expect(
            agentExecutionContext.run(scope, () =>
                documentService.updateContent(
                    account,
                    projectUuid,
                    document.documentUuid,
                    {
                        baseVersionUuid: document.version.versionUuid,
                        content: { markdown: '# Never committed', charts: {} },
                    },
                ),
            ),
        ).rejects.toThrow('ledger unavailable');
        expect(insert).toHaveBeenCalledTimes(1);
        expect(insert.mock.calls[0][1]).toBeDefined();
        expect(
            await documentModel.get(projectUuid, document.documentUuid),
        ).toEqual(before);
        expect(
            await database('documents')
                .where('document_uuid', document.documentUuid)
                .first(),
        ).toEqual(rawBefore);
        expect(
            await database('document_versions').where(
                'document_id',
                rawBefore.document_id,
            ),
        ).toEqual(versionsBefore);
        expect(
            await contentVerificationModel.getByContent(
                ContentType.DOCUMENT,
                document.documentUuid,
            ),
        ).toEqual(verificationBefore);
        expect(
            await database('agent_action_log').where(
                'project_uuid',
                projectUuid,
            ),
        ).toEqual([]);
    });

    test('rolls back initial app and version when generateApp cannot insert the ledger row', async () => {
        const {
            user,
            scope,
            projectUuid,
            spaceUuid,
            appService,
            agentActionLogModel,
            schedulerClient,
        } = await setup(true);
        const appUuid = randomUUID();
        const insert = vi
            .spyOn(agentActionLogModel, 'insert')
            .mockRejectedValueOnce(new Error('ledger unavailable'));
        await expect(
            agentExecutionContext.run(scope, () =>
                appService.generateApp(
                    user,
                    projectUuid,
                    'Create a report',
                    [],
                    appUuid,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    spaceUuid,
                    undefined,
                    { name: 'Uncommitted app', designUuidInput: null },
                ),
            ),
        ).rejects.toThrow('ledger unavailable');
        expect(insert).toHaveBeenCalledTimes(1);
        expect(insert.mock.calls[0][1]).toBeDefined();
        expect(insert.mock.calls[0][0]).toMatchObject({
            agent_identity: scope.claim,
            object_type: 'data_app',
            object_uuid: appUuid,
            action: 'create',
        });
        expect(await database('apps').where('app_id', appUuid)).toEqual([]);
        expect(await database('app_versions').where('app_id', appUuid)).toEqual(
            [],
        );
        expect(await database('app_threads').where('app_id', appUuid)).toEqual(
            [],
        );
        expect(
            await database('agent_action_log').where(
                'project_uuid',
                projectUuid,
            ),
        ).toEqual([]);
        expect(schedulerClient.appGeneratePipeline).not.toHaveBeenCalled();
    });

    test.each(
        scenarios.flatMap((scenario) =>
            ['content', 'metadata'].map((operation) => ({
                ...scenario,
                operation,
            })),
        ),
    )(
        'Document $operation agent=$agent enabled=$enabled verified=$verified',
        async ({ agent, enabled, verified, operation }) => {
            const fixture = await setup(enabled);
            const {
                projectUuid,
                documentModel,
                documentService,
                contentVerificationModel,
                account,
                user,
                scope,
            } = fixture;
            const document = await documentModel.create({
                projectUuid,
                spaceUuid: fixture.spaceUuid,
                name: 'Document',
                description: '',
                content: { markdown: '# Original', charts: {} },
                createdByUserUuid: user.userUuid,
            });
            if (verified)
                await contentVerificationModel.verify(
                    ContentType.DOCUMENT,
                    document.documentUuid,
                    projectUuid,
                    fixture.verifierUuid,
                );
            const write = async () => {
                if (operation === 'metadata')
                    return documentService.updateMetadata(
                        account,
                        projectUuid,
                        document.documentUuid,
                        { name: 'Updated' },
                    );
                const current = await documentModel.get(
                    projectUuid,
                    document.documentUuid,
                );
                return documentService.updateContent(
                    account,
                    projectUuid,
                    document.documentUuid,
                    {
                        baseVersionUuid: current.version.versionUuid,
                        content: { markdown: '# Updated', charts: {} },
                    },
                );
            };
            const run = () =>
                agent ? agentExecutionContext.run(scope, write) : write();
            await run();
            expect(
                await contentVerificationModel.getByContent(
                    ContentType.DOCUMENT,
                    document.documentUuid,
                ),
            ).toBeNull();
            await run();
            const rows = await database('agent_action_log').where({
                object_uuid: document.documentUuid,
                action: 'unverify',
            });
            expect(rows).toHaveLength(agent && enabled && verified ? 1 : 0);
            if (rows.length)
                expect(rows[0]).toMatchObject({
                    agent_identity: scope.claim,
                    object_type: 'document',
                    outcome: 'allowed',
                    version_uuid: null,
                });
        },
    );

    test.each(scenarios)(
        'app iteration agent=$agent enabled=$enabled verified=$verified',
        async ({ agent, enabled, verified }) => {
            const fixture = await setup(enabled);
            const {
                projectUuid,
                appModel,
                appService,
                contentVerificationModel,
                user,
                scope,
            } = fixture;
            const { app } = await appModel.createWithVersion(
                {
                    project_uuid: projectUuid,
                    created_by_user_uuid: user.userUuid,
                    space_uuid: fixture.spaceUuid,
                    name: 'App',
                },
                { version: 1, prompt: 'Original' },
                'ready',
            );
            if (verified)
                await contentVerificationModel.verify(
                    ContentType.DATA_APP,
                    app.app_id,
                    projectUuid,
                    fixture.verifierUuid,
                );
            const write = () =>
                appService.iterateApp(
                    user,
                    projectUuid,
                    app.app_id,
                    'Update the title',
                    [],
                );
            const run = () =>
                agent ? agentExecutionContext.run(scope, write) : write();
            await run();
            expect(
                await contentVerificationModel.getByContent(
                    ContentType.DATA_APP,
                    app.app_id,
                ),
            ).toBeNull();
            await database('app_versions')
                .where('app_id', app.app_id)
                .update({ status: 'ready' });
            await run();
            const rows = await database('agent_action_log').where({
                object_uuid: app.app_id,
                action: 'unverify',
            });
            expect(rows).toHaveLength(agent && enabled && verified ? 1 : 0);
            if (rows.length)
                expect(rows[0]).toMatchObject({
                    agent_identity: scope.claim,
                    object_type: 'data_app',
                    outcome: 'allowed',
                    version_uuid: null,
                });
        },
    );
});
