// e2b and ai are ESM-only packages that cannot be required by Jest/CJS.
// Mock them before importing AppGenerateService.
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

type AppRuntimeOverrides = {
    sandboxProvider: 'e2b' | 'docker';
    e2bApiKey: string | null;
};

const buildService = (appRuntime: AppRuntimeOverrides) => {
    const sandboxRegistryModel = {
        findIdleRunning: vi.fn().mockResolvedValue([]),
        findExpiredSuspended: vi.fn().mockResolvedValue([]),
    };
    const lightdashConfig = {
        appRuntime: {
            ...appRuntime,
            sandboxDockerImage: 'img',
            sandboxIdleTimeoutMs: 1000,
            sandboxSnapshotRetentionMs: 5000,
        },
        s3: {},
    };
    const service = new AppGenerateService({
        lightdashConfig: lightdashConfig as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: {} as never,
        featureFlagModel: {} as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: sandboxRegistryModel as never,
    });
    return { service, sandboxRegistryModel };
};

describe('AppGenerateService.reapSandboxes', () => {
    it('no-ops when the default e2b provider has no API key configured', async () => {
        const { service, sandboxRegistryModel } = buildService({
            sandboxProvider: 'e2b',
            e2bApiKey: null,
        });

        // Must resolve (not throw MissingConfigError) and never touch the
        // registry — the provider is never constructed.
        await expect(service.reapSandboxes()).resolves.toBeUndefined();
        expect(sandboxRegistryModel.findIdleRunning).not.toHaveBeenCalled();
    });

    it('runs the sweep when e2b is configured with an API key', async () => {
        const { service, sandboxRegistryModel } = buildService({
            sandboxProvider: 'e2b',
            e2bApiKey: 'e2b-key',
        });

        await service.reapSandboxes();

        expect(sandboxRegistryModel.findIdleRunning).toHaveBeenCalledTimes(1);
    });

    it('runs the sweep for docker, which needs no credentials', async () => {
        const { service, sandboxRegistryModel } = buildService({
            sandboxProvider: 'docker',
            e2bApiKey: null,
        });

        await service.reapSandboxes();

        expect(sandboxRegistryModel.findIdleRunning).toHaveBeenCalledTimes(1);
    });
});
