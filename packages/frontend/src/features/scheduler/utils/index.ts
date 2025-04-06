import { validate as validateUuid } from 'uuid';

export const getSchedulerUuidFromUrlParams = (
    search: string,
): string | null => {
    const searchParams = new URLSearchParams(search);
    const schedulerUuid = searchParams.get('scheduler_uuid');
    if (schedulerUuid && validateUuid(schedulerUuid)) {
        return schedulerUuid;
    }
    return null;
};

export const getThresholdUuidFromUrlParams = (
    search: string,
): string | null => {
    const searchParams = new URLSearchParams(search);
    const thresholdUuid = searchParams.get('threshold_uuid');
    if (thresholdUuid && validateUuid(thresholdUuid)) {
        return thresholdUuid;
    }
    return null;
};

export const isSchedulerTypeSync = (search: string): boolean => {
    const searchParams = new URLSearchParams(search);
    return searchParams.get('isSync') === 'true';
};
