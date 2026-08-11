import { SchedulerFormat, type SchedulerAndTargets } from '@lightdash/common';

// Gsheets syncs live in the sync modal, never in the delivery/alert lists.
export const isDeliveryListScheduler = (
    scheduler: SchedulerAndTargets,
    isThresholdAlert: boolean,
): boolean => {
    const isAlert = !!(scheduler.thresholds && scheduler.thresholds.length > 0);
    if (isThresholdAlert !== isAlert) return false;
    return scheduler.format !== SchedulerFormat.GSHEETS;
};
