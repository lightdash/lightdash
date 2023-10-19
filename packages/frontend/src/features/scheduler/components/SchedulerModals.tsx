import { DialogProps } from '@blueprintjs/core';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import React, { FC } from 'react';
import {
    useChartSchedulerCreateMutation,
    useChartSchedulers,
} from '../hooks/useChartSchedulers';
import {
    useDashboardSchedulerCreateMutation,
    useDashboardSchedulers,
} from '../hooks/useDashboardSchedulers';
import SchedulerModal2 from './SchedulerModal2';
import SchedulersModalBase from './SchedulerModalBase';

interface DashboardSchedulersProps extends DialogProps {
    dashboardUuid: string;
    name: string;
    onClose: () => void;
}

export const DashboardSchedulersModal: FC<DashboardSchedulersProps> = ({
    dashboardUuid,
    name,
    ...modalProps
}) => {
    const schedulersQuery = useDashboardSchedulers(dashboardUuid);
    const createMutation = useDashboardSchedulerCreateMutation();

    // TODO: this is a feature flag while we are refactoring
    // the scheduled deliveries UI. Remove it when that is done.
    const SchedulerView = useFeatureFlagEnabled('new-scheduler-ui')
        ? SchedulerModal2
        : SchedulersModalBase;

    return (
        <SchedulerView
            resourceUuid={dashboardUuid}
            name={name}
            schedulersQuery={schedulersQuery}
            createMutation={createMutation}
            isChart={false}
            {...modalProps}
        />
    );
};

interface ChartSchedulersProps extends DialogProps {
    chartUuid: string;
    name: string;
    onClose: () => void;
}

export const ChartSchedulersModal: FC<ChartSchedulersProps> = ({
    chartUuid,
    name,
    ...modalProps
}) => {
    const chartSchedulersQuery = useChartSchedulers(chartUuid);
    const createMutation = useChartSchedulerCreateMutation();

    // TODO: this is a feature flag while we are refactoring
    // the scheduled deliveries UI. Remove it when that is done.
    const SchedulerView = useFeatureFlagEnabled('new-scheduler-ui')
        ? SchedulerModal2
        : SchedulersModalBase;
    return (
        <SchedulerView
            resourceUuid={chartUuid}
            name={name}
            schedulersQuery={chartSchedulersQuery}
            createMutation={createMutation}
            isChart
            {...modalProps}
        />
    );
};
