import {
    FeatureFlags,
    SchedulerFormat,
    WarehouseTypes,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { SchedulerModel } from '../models/SchedulerModel';
import { SchedulerClient } from '../scheduler/SchedulerClient';

export class SchedulerSignInPauseService {
    static async resumeAfterSignIn({
        featureFlagModel,
        schedulerModel,
        schedulerClient,
        organizationUuid,
        userUuid,
        warehouseType,
    }: {
        featureFlagModel: FeatureFlagModel;
        schedulerModel: SchedulerModel;
        schedulerClient: SchedulerClient;
        organizationUuid: string;
        userUuid: string;
        warehouseType: WarehouseTypes;
    }): Promise<void> {
        const { enabled } = await featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.ScheduledSignInPause,
        });
        if (!enabled) return;

        const resumed = await schedulerModel.resumeAfterSignIn(
            userUuid,
            warehouseType,
            organizationUuid,
        );
        await Promise.all(
            resumed
                .filter((item) => item.format === SchedulerFormat.GSHEETS)
                .map(async ({ schedulerUuid }) => {
                    const scheduler =
                        await schedulerModel.getSchedulerAndTargets(
                            schedulerUuid,
                        );
                    if (!scheduler.enabled || !scheduler.projectUuid) return;
                    await schedulerClient.generateJobsForSchedulerTargets(
                        new Date(),
                        scheduler,
                        undefined,
                        randomUUID(),
                        {
                            organizationUuid,
                            projectUuid: scheduler.projectUuid,
                            userUuid,
                        },
                    );
                }),
        );
    }
}
