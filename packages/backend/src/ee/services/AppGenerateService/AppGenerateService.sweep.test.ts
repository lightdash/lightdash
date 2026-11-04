import { APP_VERSION_TERMINAL_STATUSES } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { AppGenerateService } from './AppGenerateService';

function buildService() {
    const appModel = {
        releaseStaleLocks: vi.fn().mockResolvedValue(0),
        failOrphanedPendingVersions: vi.fn().mockResolvedValue(0),
    };
    const service = new AppGenerateService({
        agentActionLogModel: {} as never,
        aiCreditService: {} as never,
        lightdashConfig: {} as never,
        analytics: {} as never,
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
    return { service, appModel };
}

describe('AppGenerateService.sweepStaleLocks', () => {
    it('releases stale locks and reaps jobless pending versions', async () => {
        const { service, appModel } = buildService();
        appModel.releaseStaleLocks.mockResolvedValue(1);
        appModel.failOrphanedPendingVersions.mockResolvedValue(3);

        await service.sweepStaleLocks();

        expect(appModel.releaseStaleLocks).toHaveBeenCalledWith(
            APP_VERSION_TERMINAL_STATUSES,
            '5 minutes',
        );
        expect(appModel.failOrphanedPendingVersions).toHaveBeenCalledWith(
            '10 minutes',
        );
    });

    it('still reaps when releasing locks throws', async () => {
        const { service, appModel } = buildService();
        appModel.releaseStaleLocks.mockRejectedValue(
            new Error('lock table busy'),
        );

        await expect(service.sweepStaleLocks()).rejects.toThrow(
            'lock table busy',
        );
        expect(appModel.failOrphanedPendingVersions).toHaveBeenCalledWith(
            '10 minutes',
        );
    });
});
