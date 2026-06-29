import { SchedulerFormat } from '@lightdash/common';
import { type FC } from 'react';
import SchedulerModal from '../../../../../features/scheduler/components/SchedulerModal';
import {
    useChartSchedulerCreateMutation,
    useChartSchedulers,
} from '../../../../../features/scheduler/hooks/useChartSchedulers';

const DELIVERY_FORMATS = [
    SchedulerFormat.CSV,
    SchedulerFormat.XLSX,
    SchedulerFormat.IMAGE,
    SchedulerFormat.PDF,
];

type Props = {
    chartUuid: string;
    chartName: string;
    agentUuid: string;
    sourceThreadUuid: string;
    onClose: () => void;
};

// Opens the chart's scheduler form in create mode, pre-filled with the
// conversation's agent + source thread. Mounted only while open.
export const AiScheduleDeliveryModal: FC<Props> = ({
    chartUuid,
    chartName,
    agentUuid,
    sourceThreadUuid,
    onClose,
}) => {
    const schedulersQuery = useChartSchedulers({
        chartUuid,
        formats: DELIVERY_FORMATS,
        includeLatestRun: true,
    });
    const createMutation = useChartSchedulerCreateMutation();

    return (
        <SchedulerModal
            isOpen
            isChart
            defaultCreate
            resourceUuid={chartUuid}
            name={chartName}
            schedulersQuery={schedulersQuery}
            createMutation={createMutation}
            initialFormValues={{
                agentUuid,
                sourceThreadUuid,
                includeSourceThread: true,
                format: SchedulerFormat.IMAGE,
            }}
            onClose={onClose}
        />
    );
};
