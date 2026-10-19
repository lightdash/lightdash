import { APP_VERSION_CANCELLED_BY_USER } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { AppGenerateService } from './AppGenerateService';

const APP = {
    app_id: 'app-1',
    project_uuid: 'proj-1',
    organization_uuid: 'org-1',
    space_uuid: null,
    created_by_user_uuid: 'user-1',
    sandbox_id: 'sandbox-1',
};

function buildService() {
    const appModel = {
        getApp: vi.fn().mockResolvedValue(APP),
        getVersion: vi.fn().mockResolvedValue({
            status: 'pending',
            created_at: new Date(),
            resources: null,
        }),
        getLatestVersion: vi.fn().mockResolvedValue({ version: 7 }),
        updateVersionStatusIfInProgress: vi.fn().mockResolvedValue(true),
    };
    const suspendByUuid = vi.fn().mockResolvedValue(undefined);
    const service = new AppGenerateService({
        agentActionLogModel: {} as never,
        aiCreditService: {} as never,
        lightdashConfig: {} as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {} as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        documentService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: {} as never,
        chartRegistryClient: {} as never,
        contentVerificationModel: {} as never,
    });
    // Private members; cast to a structural type so the spy keeps its
    // mock API (the same pattern as the other AppGenerateService tests).
    vi.spyOn(
        service as unknown as { getSandboxManager: () => unknown },
        'getSandboxManager',
    ).mockReturnValue({ suspendByUuid });
    vi.spyOn(
        service as unknown as { assertDataAppsEnabled: () => Promise<void> },
        'assertDataAppsEnabled',
    ).mockResolvedValue(undefined);
    vi.spyOn(
        service as unknown as { assertCanManageApp: () => Promise<unknown> },
        'assertCanManageApp',
    ).mockResolvedValue({});
    return { service, appModel, suspendByUuid };
}

const user = { userUuid: 'user-1', organizationUuid: 'org-1' } as never;

describe('AppGenerateService.cancelVersion', () => {
    it('marks the version cancelled and suspends the sandbox for the latest version', async () => {
        const { service, appModel, suspendByUuid } = buildService();

        await service.cancelVersion(user, 'proj-1', 'app-1', 7);

        expect(appModel.updateVersionStatusIfInProgress).toHaveBeenCalledWith(
            'app-1',
            7,
            'error',
            APP_VERSION_CANCELLED_BY_USER,
            APP_VERSION_CANCELLED_BY_USER,
        );
        expect(suspendByUuid).toHaveBeenCalledWith(
            'sandbox-1',
            expect.anything(),
        );
    });

    it('suspends the sandbox when a non-latest version had already started building', async () => {
        const { service, appModel, suspendByUuid } = buildService();
        appModel.getVersion.mockResolvedValue({
            status: 'building',
            created_at: new Date(),
            resources: null,
        });

        await service.cancelVersion(user, 'proj-1', 'app-1', 3);

        expect(appModel.updateVersionStatusIfInProgress).toHaveBeenCalledWith(
            'app-1',
            3,
            'error',
            APP_VERSION_CANCELLED_BY_USER,
            APP_VERSION_CANCELLED_BY_USER,
        );
        expect(suspendByUuid).toHaveBeenCalledWith(
            'sandbox-1',
            expect.anything(),
        );
    });

    it('does not touch the sandbox when cancelling a non-latest version', async () => {
        const { service, appModel, suspendByUuid } = buildService();

        await service.cancelVersion(user, 'proj-1', 'app-1', 3);

        expect(appModel.updateVersionStatusIfInProgress).toHaveBeenCalledWith(
            'app-1',
            3,
            'error',
            APP_VERSION_CANCELLED_BY_USER,
            APP_VERSION_CANCELLED_BY_USER,
        );
        expect(suspendByUuid).not.toHaveBeenCalled();
    });
});
