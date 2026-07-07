import { type AppBuildFromSourceJobPayload } from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

type SandboxStub = {
    sandboxId: string;
    pause: ReturnType<typeof vi.fn>;
    commands: { run: ReturnType<typeof vi.fn> };
    files: {
        write: ReturnType<typeof vi.fn>;
        readBytes: ReturnType<typeof vi.fn>;
    };
};

type ServiceWithPrivates = {
    runBuildFromSourcePipeline: (
        payload: AppBuildFromSourceJobPayload,
    ) => Promise<void>;
    getS3Client: ReturnType<typeof vi.fn>;
    createSandbox: ReturnType<typeof vi.fn>;
    restoreSourceFromS3: ReturnType<typeof vi.fn>;
    runBuild: ReturnType<typeof vi.fn>;
    packageArtifacts: ReturnType<typeof vi.fn>;
    uploadToS3: ReturnType<typeof vi.fn>;
    suspendSandbox: ReturnType<typeof vi.fn>;
    markError: ReturnType<typeof vi.fn>;
};

const fakeSandbox: SandboxStub = {
    sandboxId: 'sandbox-123',
    pause: vi.fn().mockResolvedValue(undefined),
    commands: { run: vi.fn() },
    files: {
        write: vi.fn().mockResolvedValue(undefined),
        readBytes: vi.fn(),
    },
};

const makePayload = (): AppBuildFromSourceJobPayload => ({
    appUuid: 'app-uuid-1',
    version: 1,
    projectUuid: 'proj-uuid-1',
    organizationUuid: 'org-uuid-1',
    userUuid: 'user-uuid-1',
});

function buildService() {
    const appModel = {
        updateVersionStatusIfInProgress: vi.fn().mockResolvedValue(true),
        updateSandboxUuid: vi.fn().mockResolvedValue(undefined),
    };

    const raw = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
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
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });

    const service = raw as unknown as ServiceWithPrivates;

    service.getS3Client = vi.fn().mockReturnValue({
        client: {},
        bucket: 'test-bucket',
    });
    service.createSandbox = vi.fn().mockResolvedValue({
        sandbox: fakeSandbox,
        sandboxUuid: 'sandbox-uuid-123',
        durationMs: 100,
    });
    service.restoreSourceFromS3 = vi.fn().mockResolvedValue(50);
    service.packageArtifacts = vi.fn().mockResolvedValue({
        distTar: Buffer.from('dist'),
        sourceTar: Buffer.from('src'),
        durationMs: 200,
    });
    service.uploadToS3 = vi.fn().mockResolvedValue(100);
    service.suspendSandbox = vi.fn().mockResolvedValue(undefined);
    service.markError = vi.fn().mockResolvedValue(true);

    return { service, appModel };
}

describe('AppGenerateService.runBuildFromSourcePipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fakeSandbox.pause.mockReset().mockResolvedValue(undefined);
    });

    it('happy path: advances sandbox→building→packaging→ready, uploads, no markError', async () => {
        const { service, appModel } = buildService();

        service.runBuild = vi
            .fn()
            .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

        await service.runBuildFromSourcePipeline(makePayload());

        const calls = appModel.updateVersionStatusIfInProgress.mock
            .calls as unknown[][];
        const statuses = calls.map((c) => c[2]);
        expect(statuses).toContain('sandbox');
        expect(statuses).toContain('building');
        expect(statuses).toContain('packaging');
        expect(statuses).toContain('ready');
        expect(statuses.indexOf('sandbox')).toBeLessThan(
            statuses.indexOf('building'),
        );
        expect(statuses.indexOf('building')).toBeLessThan(
            statuses.indexOf('packaging'),
        );
        expect(statuses.indexOf('packaging')).toBeLessThan(
            statuses.indexOf('ready'),
        );

        expect(service.uploadToS3).toHaveBeenCalledOnce();
        expect(service.markError).not.toHaveBeenCalled();
    });

    it('build failure: markError called with "Build failed", packageArtifacts and uploadToS3 NOT called, ready never reached', async () => {
        const { service, appModel } = buildService();

        service.runBuild = vi
            .fn()
            .mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'boom' });

        await service.runBuildFromSourcePipeline(makePayload());

        expect(service.markError).toHaveBeenCalledWith(
            'app-uuid-1',
            1,
            'boom',
            'Build failed',
        );
        expect(service.packageArtifacts).not.toHaveBeenCalled();
        expect(service.uploadToS3).not.toHaveBeenCalled();

        const statusesReached = (
            appModel.updateVersionStatusIfInProgress.mock.calls as unknown[][]
        ).map((c) => c[2]);
        expect(statusesReached).not.toContain('ready');
    });
});
