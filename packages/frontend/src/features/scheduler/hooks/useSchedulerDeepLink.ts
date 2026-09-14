import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
    getSchedulerUuidFromUrlParams,
    getThresholdUuidFromUrlParams,
    isSchedulerTypeSync,
} from '../utils';

export type SchedulerDeepLink = {
    modal: 'scheduledDeliveries' | 'thresholdAlerts' | 'googleSheetsSync';
    schedulerUuid: string | null;
    thresholdUuid: string | null;
};

const readDeepLink = (search: string): SchedulerDeepLink | null => {
    const schedulerUuid = getSchedulerUuidFromUrlParams(search);
    const thresholdUuid = getThresholdUuidFromUrlParams(search);
    if (schedulerUuid) {
        return {
            modal: isSchedulerTypeSync(search)
                ? 'googleSheetsSync'
                : 'scheduledDeliveries',
            schedulerUuid,
            thresholdUuid: null,
        };
    }
    if (thresholdUuid) {
        return { modal: 'thresholdAlerts', schedulerUuid: null, thresholdUuid };
    }
    return null;
};

/**
 * Reads a scheduler or alert deep link from the chart page URL once, then
 * clears the params so closing the modal does not reopen it.
 */
export const useSchedulerDeepLink = (): SchedulerDeepLink | null => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const [deepLink] = useState(() => readDeepLink(search));

    useEffect(() => {
        if (!deepLink) return;
        const params = new URLSearchParams(search);
        if (
            !params.has('scheduler_uuid') &&
            !params.has('threshold_uuid') &&
            !params.has('isSync')
        ) {
            return;
        }
        params.delete('scheduler_uuid');
        params.delete('threshold_uuid');
        params.delete('isSync');
        void navigate(
            { pathname, search: params.toString() },
            { replace: true },
        );
    }, [deepLink, search, pathname, navigate]);

    return deepLink;
};
