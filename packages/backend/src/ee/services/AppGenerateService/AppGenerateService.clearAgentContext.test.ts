import { ForbiddenError, ProjectType } from '@lightdash/common';
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

const PROJECT_UUID = 'proj-uuid-1';
const APP_UUID = 'app-uuid-1';
const USER_UUID = 'user-uuid-1';
const ORG_UUID = 'org-uuid-1';

const makeUser = () =>
    ({ userUuid: USER_UUID, organizationUuid: ORG_UUID }) as never;

function buildService(opts: { canManage?: boolean } = {}) {
    const appModel = {
        getApp: vi.fn().mockResolvedValue({
            app_id: APP_UUID,
            project_uuid: PROJECT_UUID,
            organization_uuid: ORG_UUID,
            space_uuid: null,
            created_by_user_uuid: USER_UUID,
            sandbox_id: null,
            template: 'data_app',
            registry_slug: null,
        }),
        getLatestVersion: vi
            .fn()
            .mockResolvedValue({ version: 4, status: 'ready' }),
        createThread: vi.fn().mockResolvedValue({
            app_thread_uuid: 'thread-2',
            thread_number: 2,
        }),
    };

    const service = new AppGenerateService({
        lightdashConfig: {
            appRuntime: {
                dependencyRegistryHosts: ['registry.npmjs.org'],
                dataAppCodingAgent: 'claude',
            },
        } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: ORG_UUID,
                projectUuid: PROJECT_UUID,
                type: ProjectType.DEFAULT,
                createdByUserUuid: USER_UUID,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                organizationUuid: ORG_UUID,
                projectUuid: PROJECT_UUID,
                inheritsFromOrgOrProject: false,
                access: [],
                admins: [],
                directOnly: false,
            }),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        chartRegistryClient: {} as never,
        contentVerificationModel: {} as never,
    });

    const canManage = opts.canManage ?? true;
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({
        can: () => canManage,
        cannot: () => !canManage,
        rules: [],
    });

    return { service, appModel };
}

describe('clearAgentContext', () => {
    it('refuses while a version is building and starts no thread', async () => {
        const { service, appModel } = buildService();
        appModel.getLatestVersion.mockResolvedValue({
            version: 4,
            status: 'generating',
        });

        await expect(
            service.clearAgentContext(makeUser(), PROJECT_UUID, APP_UUID),
        ).rejects.toThrow('A version is already building for this app');
        expect(appModel.createThread).not.toHaveBeenCalled();
    });

    it('rejects a user without manage permission', async () => {
        const { service, appModel } = buildService({ canManage: false });

        await expect(
            service.clearAgentContext(makeUser(), PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(ForbiddenError);
        expect(appModel.createThread).not.toHaveBeenCalled();
    });
});
