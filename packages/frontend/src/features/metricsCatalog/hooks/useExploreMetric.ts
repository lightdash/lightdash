import { useCallback } from 'react';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { toggleMetricExploreModal } from '../store/metricsCatalogSlice';

/**
 * Opens the Metric Explorer modal for a metric: tracks the event and sets the
 * selected metric in Redux. Does NOT navigate — callers that need a URL change
 * do that themselves.
 */
export const useExploreMetric = () => {
    const dispatch = useAppDispatch();
    const { track } = useTracking();

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );

    return useCallback(
        ({
            tableName,
            metricName,
        }: {
            tableName: string;
            metricName: string;
        }) => {
            track({
                name: EventName.METRICS_CATALOG_EXPLORE_CLICKED,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    metricName,
                    tableName,
                },
            });

            dispatch(toggleMetricExploreModal({ name: metricName, tableName }));
        },
        [dispatch, track, userUuid, organizationUuid, projectUuid],
    );
};
