import { type ItemsMap } from '@lightdash/common';
import React, { type FC } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import {
    useChartSchedulerCreateMutation,
    useChartSchedulers,
} from '../hooks/useChartSchedulers';
import {
    useDashboardSchedulerCreateMutation,
    useDashboardSchedulers,
} from '../hooks/useDashboardSchedulers';
import SchedulerModal from './SchedulerModal';

interface DashboardSchedulersProps {
    dashboardUuid: string;
    name: string;
    isOpen: boolean;
    onClose: () => void;
}

export const DashboardSchedulersModal: FC<DashboardSchedulersProps> = ({
    dashboardUuid,
    name,
    ...modalProps
}) => {
    const schedulersQuery = useDashboardSchedulers(dashboardUuid);
    const createMutation = useDashboardSchedulerCreateMutation();

    // Extract parameter data from dashboard context
    const parameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );
    const currentParameterValues = useDashboardContext(
        (c) => c.parameterValues,
    );

    return (
        <SchedulerModal
            resourceUuid={dashboardUuid}
            name={name}
            schedulersQuery={schedulersQuery}
            createMutation={createMutation}
            isChart={false}
            parameterReferences={parameterReferences}
            currentParameterValues={currentParameterValues}
            {...modalProps}
        />
    );
};

interface ChartSchedulersProps {
    chartUuid: string;
    name: string;
    isOpen: boolean;
    isThresholdAlert?: boolean;
    itemsMap?: ItemsMap;
    onClose: () => void;
}

export const ChartSchedulersModal: FC<ChartSchedulersProps> = ({
    chartUuid,
    name,
    ...modalProps
}) => {
    const chartSchedulersQuery = useChartSchedulers(chartUuid);
    const createMutation = useChartSchedulerCreateMutation();

    // Extract parameter data from explorer context
    const explorerParameterReferences = useExplorerContext(
        (c) => c.state.parameterReferences,
    );
    const currentParameterValues = useExplorerContext(
        (c) => c.state.unsavedChartVersion.parameters || {},
    );

    // Convert null to undefined and array to proper format
    const parameterReferences = explorerParameterReferences || undefined;

    return (
        <SchedulerModal
            resourceUuid={chartUuid}
            name={name}
            schedulersQuery={chartSchedulersQuery}
            createMutation={createMutation}
            isChart
            parameterReferences={parameterReferences}
            currentParameterValues={currentParameterValues}
            {...modalProps}
        />
    );
};
