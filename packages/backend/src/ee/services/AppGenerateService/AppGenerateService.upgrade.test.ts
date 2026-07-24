import { ForbiddenError, ParameterError } from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

const PROJECT_UUID = 'proj-uuid-1';
const APP_UUID = 'app-uuid-1';
const USER_UUID = 'user-uuid-1';
const USER_ORG_UUID = 'org-uuid-user';

const makeUser = () =>
    ({
        userUuid: USER_UUID,
        organizationUuid: USER_ORG_UUID,
    }) as never;

const makeApp = (overrides: Record<string, unknown> = {}) => ({
    app_id: APP_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: USER_ORG_UUID,
    space_uuid: null,
    created_by_user_uuid: USER_UUID,
    sandbox_id: 'sandbox-registry-uuid',
    design_uuid: null,
    ...overrides,
});

function buildService(opts: { canManage?: boolean } = {}) {
    const appModel = {
        getApp: vi.fn().mockResolvedValue(makeApp()),
        getLatestVersion: vi.fn().mockResolvedValue({
            version: 4,
            status: 'ready',
            dependencies: null,
            created_at: new Date(),
        }),
        getLatestReadyVersion: vi.fn().mockResolvedValue({ version: 4 }),
        getVersionsWithDependencies: vi.fn().mockResolvedValue([]),
        createVersion: vi.fn().mockResolvedValue({ version: 5 }),
        updateSandboxUuid: vi.fn().mockResolvedValue(undefined),
    };

    const schedulerClient = {
        appGeneratePipeline: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };

    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };

    const spacePermissionService = {
        getSpaceAccessContext: vi.fn().mockResolvedValue({}),
    };

    const analytics = { track: vi.fn() };

    const lightdashConfig = {
        appRuntime: {
            customDependenciesEnabled: true,
            dependencyRegistryHosts: ['registry.npmjs.org'],
        },
    };

    const service = new AppGenerateService({
        lightdashConfig: lightdashConfig as never,
        analytics: analytics as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });

    const canManage = opts.canManage ?? true;
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({
        can: () => canManage,
        cannot: () => !canManage,
    });

    return { service, appModel, schedulerClient, analytics };
}

describe('upgradeApp', () => {
    it('stores the short label and enqueues a composed prompt with the candidate features', async () => {
        const { service, appModel, schedulerClient, analytics } =
            buildService();

        const result = await service.upgradeApp(
            makeUser(),
            PROJECT_UUID,
            APP_UUID,
            {
                reportedSdkVersion: '0.3400.0',
                reportedFeatures: ['query', 'inspect'],
                candidateFeatures: [
                    {
                        key: 'drill-down',
                        label: 'Drill down',
                        description: 'Explore a metric by another dimension',
                    },
                ],
            },
        );

        expect(result).toEqual({ appUuid: APP_UUID, version: 5 });
        expect(appModel.createVersion).toHaveBeenCalledWith(
            APP_UUID,
            { version: 5, prompt: 'Upgrade to the latest app template' },
            'pending',
            USER_UUID,
            undefined,
            undefined,
        );

        const payload = schedulerClient.appGeneratePipeline.mock.calls[0][0];
        expect(payload.isUpgrade).toBe(true);
        expect(payload.isIteration).toBe(true);
        expect(payload.version).toBe(5);
        expect(payload.prompt).toContain(
            'drill-down: Drill down — Explore a metric by another dimension',
        );
        expect(payload.prompt).toContain('@lightdash/query-sdk');
        expect(payload.prompt).toContain('Never infer or invent');
        expect(payload.prompt).toContain('non-technical app owner');
        expect(payload.prompt).not.toBe('Upgrade to the latest app template');

        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.upgrade_requested',
                properties: expect.objectContaining({
                    appUuid: APP_UUID,
                    version: 5,
                    reportedSdkVersion: '0.3400.0',
                    reportedFeatureCount: 2,
                }),
            }),
        );
    });

    it('falls back to reading the installed registry when no candidates are sent', async () => {
        const { service, schedulerClient } = buildService();

        await service.upgradeApp(makeUser(), PROJECT_UUID, APP_UUID, {});

        const payload = schedulerClient.appGeneratePipeline.mock.calls[0][0];
        expect(payload.prompt).toContain('dist/features.js');
        expect(payload.prompt).toContain('skip the feature list entirely');
        expect(payload.prompt).toContain('Never infer or invent');
    });

    it('rejects when the app has no ready version', async () => {
        const { service, appModel } = buildService();
        appModel.getLatestVersion.mockResolvedValue({
            version: 1,
            status: 'error',
            dependencies: null,
        });
        appModel.getLatestReadyVersion.mockResolvedValue(null);

        await expect(
            service.upgradeApp(makeUser(), PROJECT_UUID, APP_UUID, {}),
        ).rejects.toThrow(ParameterError);
    });

    it('rejects when a version is already building', async () => {
        const { service, appModel } = buildService();
        appModel.getLatestVersion.mockResolvedValue({
            version: 4,
            status: 'generating',
            dependencies: null,
        });

        await expect(
            service.upgradeApp(makeUser(), PROJECT_UUID, APP_UUID, {}),
        ).rejects.toThrow('A version is already building for this app');
    });

    it('rejects a user without manage permission', async () => {
        const { service } = buildService({ canManage: false });

        await expect(
            service.upgradeApp(makeUser(), PROJECT_UUID, APP_UUID, {}),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('prepareUpgradeColdStart', () => {
    type PrepareFn = (
        appUuid: string,
        projectUuid: string,
        copilot: unknown,
        extraEgressHosts: string[],
    ) => Promise<Buffer | null>;

    const setup = (
        opts: { resumeFails?: boolean; sandboxId?: string | null } = {},
    ) => {
        const { service, appModel } = buildService();
        appModel.getApp.mockResolvedValue(
            makeApp({
                sandbox_id:
                    opts.sandboxId !== undefined
                        ? opts.sandboxId
                        : 'sandbox-registry-uuid',
            }),
        );
        const oldSandbox = {
            sandboxId: 'provider-sandbox-id',
            commands: {
                run: vi
                    .fn()
                    .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
            },
            files: {
                readBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
            },
        };
        const resumeSpy = vi.spyOn(
            service as unknown as { resumeSandbox: () => unknown },
            'resumeSandbox',
        );
        if (opts.resumeFails) {
            resumeSpy.mockRejectedValue(new Error('sandbox expired'));
        } else {
            resumeSpy.mockResolvedValue({ sandbox: oldSandbox, durationMs: 5 });
        }
        const manager = { destroy: vi.fn().mockResolvedValue(undefined) };
        vi.spyOn(
            service as unknown as { getSandboxManager: () => unknown },
            'getSandboxManager',
        ).mockReturnValue(manager);
        const prepare = (
            service as unknown as { prepareUpgradeColdStart: PrepareFn }
        ).prepareUpgradeColdStart.bind(service);
        return { prepare, appModel, manager, oldSandbox };
    };

    it('tars the Claude session, destroys the sandbox, and clears sandbox_id', async () => {
        const { prepare, appModel, manager, oldSandbox } = setup();

        const tar = await prepare(APP_UUID, PROJECT_UUID, {}, []);

        expect(tar).not.toBeNull();
        expect(oldSandbox.commands.run).toHaveBeenCalledWith(
            expect.stringContaining('--ignore-failed-read'),
            expect.anything(),
        );
        expect(manager.destroy).toHaveBeenCalledWith({
            sandboxUuid: 'sandbox-registry-uuid',
        });
        expect(appModel.updateSandboxUuid).toHaveBeenCalledWith(APP_UUID, null);
    });

    it('still destroys and clears when the old sandbox cannot be resumed', async () => {
        const { prepare, appModel, manager } = setup({ resumeFails: true });

        const tar = await prepare(APP_UUID, PROJECT_UUID, {}, []);

        expect(tar).toBeNull();
        expect(manager.destroy).toHaveBeenCalledWith({
            sandboxUuid: 'sandbox-registry-uuid',
        });
        expect(appModel.updateSandboxUuid).toHaveBeenCalledWith(APP_UUID, null);
    });

    it('is a no-op when the app has no sandbox', async () => {
        const { prepare, appModel, manager } = setup({ sandboxId: null });

        const tar = await prepare(APP_UUID, PROJECT_UUID, {}, []);

        expect(tar).toBeNull();
        expect(manager.destroy).not.toHaveBeenCalled();
        expect(appModel.updateSandboxUuid).not.toHaveBeenCalled();
    });
});
