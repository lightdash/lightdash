import { AgentActorSurface } from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import * as auditLogger from '../../../logging/winston';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../../../services/AiAccessService/agentExecutionContext';
// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const agentActionLogModel = { insert: vi.fn().mockResolvedValue(undefined) };

const USER = { userUuid: 'user-1', organizationUuid: 'org-1' } as never;
const BRAND_THEME = {
    designUuid: 'design-brand',
    name: 'Brand',
    files: [],
};

function buildService() {
    const appModel = {
        createWithVersion: vi.fn().mockResolvedValue({
            app: { slug: 'new-app' },
            version: { app_version_id: 'version-1' },
        }),
        createVersion: vi
            .fn()
            .mockResolvedValue({ app_version_id: 'version-2' }),
        getApp: vi.fn().mockResolvedValue({
            app_id: 'app-1',
            project_uuid: 'project-1',
            organization_uuid: 'org-1',
            created_by_user_uuid: 'user-1',
            space_uuid: null,
            design_uuid: null,
            registry_slug: null,
            template: null,
        }),
        getLatestVersion: vi.fn().mockResolvedValue({
            version: 1,
            status: 'ready',
            dependencies: null,
            created_at: new Date(),
        }),
        updateDesignUuid: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = {
        appGeneratePipeline: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AppGenerateService({
        agentActionLogModel,
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: {
            appRuntime: { sampleDataEnabled: true },
        } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {
            getDefault: vi.fn().mockResolvedValue(null),
            findInOrganization: vi
                .fn()
                .mockImplementation(async (_org: string, uuid: string) =>
                    uuid === BRAND_THEME.designUuid ? BRAND_THEME : undefined,
                ),
        } as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-1' }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                inheritsFromOrgOrProject: false,
                access: [],
                admins: [],
                directOnly: false,
            }),
        } as never,
        coderService: {} as never,
        documentService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            getDataAppModelVisibility: async () => null,
        } as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: buildAppThumbnailClientMock(),
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
            verify: async () => undefined,
            unverify: async () => undefined,
        } as never,
    });
    // Bypass real CASL — the prompt the pipeline receives is what these tests cover.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({ can: () => true, cannot: () => false });
    return { service, appModel, schedulerClient };
}

const pipelinePrompt = (schedulerClient: {
    appGeneratePipeline: ReturnType<typeof vi.fn>;
}): string => schedulerClient.appGeneratePipeline.mock.calls[0][0].prompt;

const THEME_RESTYLE_RULES = [
    'Only change visual styling needed for the theme: colors, typography, spacing, borders, shadows, chart palette, and appropriate theme asset usage.',
    'If a theme is active, read and use the files under /app/src/design/ and follow the organization theme instructions. Do not edit files under /app/src/design/.',
];

describe('AppGenerateService.iterateApp with a theme', () => {
    it('appends the theme change to the prompt when both are given', async () => {
        const { service, appModel, schedulerClient } = buildService();

        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'Add a region filter',
            [],
            undefined,
            undefined,
            undefined,
            {
                creationExperience: 'ai_agent',
                designUuidInput: 'design-brand',
                themeChangePrompt: 'append',
            },
        );

        expect(pipelinePrompt(schedulerClient)).toBe(
            [
                'Add a region filter',
                '',
                'In the same build, restyle the app to follow the active organization theme "Brand".',
                'Apart from the change requested above, preserve the app content exactly: do not change other text, metrics, queries, filters, chart semantics, layout intent, or interactions.',
                ...THEME_RESTYLE_RULES,
            ].join('\n'),
        );
        expect(appModel.updateDesignUuid).toHaveBeenCalledWith(
            'app-1',
            'project-1',
            'design-brand',
        );
        const [, , , , resources] = appModel.createVersion.mock.calls[0];
        expect(resources.design).toEqual({
            designUuid: 'design-brand',
            name: 'Brand',
            fileCount: 0,
        });
    });

    it('keeps the style-only prompt for a theme change alone', async () => {
        const { service, schedulerClient } = buildService();

        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'Apply theme: Brand',
            [],
            undefined,
            undefined,
            undefined,
            { designUuidInput: 'design-brand', themeChangePrompt: 'replace' },
        );

        const prompt = pipelinePrompt(schedulerClient);
        expect(prompt.startsWith('Restyle the current app')).toBe(true);
        expect(prompt).toContain('Preserve the app content exactly');
        expect(prompt).not.toContain('Apply theme: Brand');
    });

    it("leaves the builder's synthetic prompt path unchanged by default", async () => {
        const { service, schedulerClient } = buildService();

        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'Apply theme: Brand',
            [],
            undefined,
            undefined,
            undefined,
            {
                creationExperience: 'app_builder',
                designUuidInput: 'design-brand',
            },
        );

        expect(pipelinePrompt(schedulerClient)).toBe(
            [
                'Restyle the current app to follow the active organization theme "Brand".',
                'Preserve the app content exactly: do not change text, metrics, queries, filters, chart semantics, layout intent, or interactions.',
                ...THEME_RESTYLE_RULES,
            ].join('\n'),
        );
    });

    it('sends the prompt as-is and keeps the app theme when no theme is given', async () => {
        const { service, appModel, schedulerClient } = buildService();

        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'Add a region filter',
            [],
            undefined,
            undefined,
            undefined,
            { creationExperience: 'ai_agent' },
        );

        expect(pipelinePrompt(schedulerClient)).toBe('Add a region filter');
        expect(appModel.updateDesignUuid).not.toHaveBeenCalled();
    });
});

describe('data app agent attribution', () => {
    afterEach(() => vi.restoreAllMocks());
    test.each([
        [AgentActorSurface.MCP, true],
        [AgentActorSurface.IN_APP_AGENT, true],
        [AgentActorSurface.SLACK_AGENT, true],
        [AgentActorSurface.IN_APP_AGENT, false],
        [null, true],
    ] as const)(
        '%s enabled=%s stamps before enqueue and audits once',
        async (surface, enabled) => {
            const { service, appModel, schedulerClient } = buildService();
            const scope = createAgentExecutionContext({
                account: fromSession({
                    ...defaultSessionUser,
                    userUuid: 'user-1',
                    organizationUuid: 'org-1',
                }),
                surface: surface ?? AgentActorSurface.IN_APP_AGENT,
                clientId: 'trusted-client',
                agentUuid: 'agent',
                agentIdentityEnabled: enabled,
            });
            const claim = surface && enabled ? scope.claim : null;
            agentActionLogModel.insert.mockClear();
            const log = vi
                .spyOn(auditLogger, 'logAuditEvent')
                .mockImplementation(() => {});
            const run = async () => {
                await service.iterateApp(
                    USER,
                    'project-1',
                    'app-1',
                    'Add a region filter',
                    [],
                );
                expect(appModel.createVersion.mock.calls[0].at(-1)).toEqual(
                    claim,
                );
                const writes = log.mock.calls.filter(
                    ([event]) =>
                        event.resource.metadata?.event ===
                        'agent_content.write',
                );
                expect(writes).toHaveLength(claim ? 1 : 0);
                expect(agentActionLogModel.insert).toHaveBeenCalledTimes(
                    claim ? 1 : 0,
                );
                if (claim)
                    expect(agentActionLogModel.insert).toHaveBeenLastCalledWith(
                        expect.objectContaining({
                            agent_identity: claim,
                            object_type: 'data_app',
                            outcome: 'allowed',
                        }),
                    );
                agentActionLogModel.insert.mockClear();
                if (claim)
                    expect(writes[0][0].resource.metadata).toMatchObject({
                        objectType: 'data_app',
                        objectUuid: 'app-1',
                        versionUuid: 'version-2',
                        action: 'update',
                    });
                expect(
                    appModel.createVersion.mock.invocationCallOrder[0],
                ).toBeLessThan(
                    schedulerClient.appGeneratePipeline.mock
                        .invocationCallOrder[0],
                );
                log.mockClear();
                await service.generateApp(
                    USER,
                    'project-1',
                    'Create app',
                    [],
                    'new-app',
                );
                expect(appModel.createWithVersion.mock.calls[0].at(-1)).toEqual(
                    claim,
                );
                const creates = log.mock.calls.filter(
                    ([event]) =>
                        event.resource.metadata?.event ===
                        'agent_content.write',
                );
                expect(creates).toHaveLength(claim ? 1 : 0);
                expect(agentActionLogModel.insert).toHaveBeenCalledTimes(
                    claim ? 1 : 0,
                );
                if (claim)
                    expect(agentActionLogModel.insert).toHaveBeenLastCalledWith(
                        expect.objectContaining({
                            agent_identity: claim,
                            object_type: 'data_app',
                            outcome: 'allowed',
                        }),
                    );
                agentActionLogModel.insert.mockClear();
                if (claim)
                    expect(creates[0][0].resource.metadata).toMatchObject({
                        objectType: 'data_app',
                        objectUuid: 'new-app',
                        versionUuid: 'version-1',
                        action: 'create',
                    });
                expect(
                    appModel.createWithVersion.mock.invocationCallOrder[0],
                ).toBeLessThan(
                    schedulerClient.appGeneratePipeline.mock
                        .invocationCallOrder[1],
                );
            };
            if (surface) await agentExecutionContext.run(scope, run);
            else await run();
        },
    );
});
