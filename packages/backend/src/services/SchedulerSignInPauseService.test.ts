import { SchedulerFormat, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { SchedulerSignInPauseService } from './SchedulerSignInPauseService';

describe('SchedulerSignInPauseService', () => {
    it('resumes matching schedules and queues one Sheets sync', async () => {
        const resumeAfterSignIn = vi.fn().mockResolvedValue([
            { schedulerUuid: 'delivery-1', format: SchedulerFormat.PDF },
            { schedulerUuid: 'sync-1', format: SchedulerFormat.GSHEETS },
        ]);
        const generateJobsForSchedulerTargets = vi
            .fn()
            .mockResolvedValue(undefined);
        await SchedulerSignInPauseService.resumeAfterSignIn({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as never,
            schedulerModel: {
                resumeAfterSignIn,
                getSchedulerAndTargets: vi.fn().mockResolvedValue({
                    schedulerUuid: 'sync-1',
                    enabled: true,
                    projectUuid: 'project-1',
                }),
            } as never,
            schedulerClient: { generateJobsForSchedulerTargets } as never,
            organizationUuid: 'organization-1',
            userUuid: 'user-1',
            warehouseType: WarehouseTypes.BIGQUERY,
        });
        expect(resumeAfterSignIn).toHaveBeenCalledWith(
            'user-1',
            WarehouseTypes.BIGQUERY,
            'organization-1',
        );
        expect(generateJobsForSchedulerTargets).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the flag is off', async () => {
        const resumeAfterSignIn = vi.fn();
        await SchedulerSignInPauseService.resumeAfterSignIn({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: false }),
            } as never,
            schedulerModel: { resumeAfterSignIn } as never,
            schedulerClient: {} as never,
            organizationUuid: 'organization-1',
            userUuid: 'user-1',
            warehouseType: WarehouseTypes.BIGQUERY,
        });
        expect(resumeAfterSignIn).not.toHaveBeenCalled();
    });
});
