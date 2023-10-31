import React, { FC } from 'react';
import {
    useChartSchedulerCreateMutation,
    useChartSchedulers,
} from '../hooks/useChartSchedulers';
import {
    useDashboardSchedulerCreateMutation,
    useDashboardSchedulers,
} from '../hooks/useDashboardSchedulers';
import SchedulerModal2 from './SchedulerModal';

interface DashboardSchedulersProps {
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

    return (
        <SchedulerModal2
            resourceUuid={dashboardUuid}
            name={name}
            schedulersQuery={schedulersQuery}
            createMutation={createMutation}
            isChart={false}
            {...modalProps}
        />
    );
};

interface ChartSchedulersProps {
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

    return (
        <SchedulerModal2
            resourceUuid={chartUuid}
            name={name}
            schedulersQuery={chartSchedulersQuery}
            createMutation={createMutation}
            isChart
            {...modalProps}
        />
    );
};
