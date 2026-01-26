import { SchedulerFormat, type ItemsMap } from '@lightdash/common';
import { useDebouncedValue } from '@mantine-8/hooks';
import { useState, type FC } from 'react';
import {
    selectParameterDefinitions,
    selectParameters,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
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
    /** If provided, opens directly in edit mode for this scheduler */
    initialSchedulerUuid?: string;
}

export const DashboardSchedulersModal: FC<DashboardSchedulersProps> = ({
    dashboardUuid,
    name,
    ...modalProps
}) => {
    const [searchQuery, setSearchQuery] = useState<string | undefined>();
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const schedulersQuery = useDashboardSchedulers({
        dashboardUuid,
        searchQuery: debouncedSearchQuery,
    });
    const createMutation = useDashboardSchedulerCreateMutation();

    // Extract parameter data from dashboard context
    const currentParameterValues = useDashboardContext(
        (c) => c.parameterValues,
    );
    const availableParameters = useDashboardContext(
        (c) => c.parameterDefinitions,
    );

    return (
        <SchedulerModal
            resourceUuid={dashboardUuid}
            name={name}
            schedulersQuery={schedulersQuery}
            createMutation={createMutation}
            isChart={false}
            currentParameterValues={currentParameterValues}
            availableParameters={availableParameters}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
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
    /** If provided, opens directly in edit mode for this scheduler */
    initialSchedulerUuid?: string;
}

// Formats for scheduled deliveries (excludes Google Sheets which has its own modal)
const DELIVERY_FORMATS = [
    SchedulerFormat.CSV,
    SchedulerFormat.XLSX,
    SchedulerFormat.IMAGE,
];

export const ChartSchedulersModal: FC<ChartSchedulersProps> = ({
    chartUuid,
    name,
    ...modalProps
}) => {
    const [searchQuery, setSearchQuery] = useState<string | undefined>();
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const chartSchedulersQuery = useChartSchedulers({
        chartUuid,
        searchQuery: debouncedSearchQuery,
        formats: DELIVERY_FORMATS,
    });
    const createMutation = useChartSchedulerCreateMutation();

    // Extract parameter data from Redux
    const currentParameterValues = useExplorerSelector(selectParameters);
    const availableParameters = useExplorerSelector(selectParameterDefinitions);

    return (
        <SchedulerModal
            resourceUuid={chartUuid}
            name={name}
            schedulersQuery={chartSchedulersQuery}
            createMutation={createMutation}
            isChart
            currentParameterValues={currentParameterValues}
            availableParameters={availableParameters}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            {...modalProps}
        />
    );
};
