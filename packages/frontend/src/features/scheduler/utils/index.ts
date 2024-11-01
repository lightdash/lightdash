export const getSchedulerUuidFromUrlParams = (
    search: string,
): string | null => {
    const searchParams = new URLSearchParams(search);
    return searchParams.get('scheduler_uuid');
};

export const getThresholdUuidFromUrlParams = (
    search: string,
): string | null => {
    const searchParams = new URLSearchParams(search);
    return searchParams.get('threshold_uuid');
};

export const isSchedulerTypeSync = (search: string): string | null => {
    const searchParams = new URLSearchParams(search);
    return searchParams.get('isSync');
};
