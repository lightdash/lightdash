import { SchedulerFormat } from '@lightdash/common';
import { type FC } from 'react';
import SchedulerModal from '../../../../../features/scheduler/components/SchedulerModal';
import {
    DEFAULT_AI_AUGMENTATION_PROMPT,
    DELIVERY_FORMATS,
} from '../../../../../features/scheduler/components/types';
import {
    useChartSchedulerCreateMutation,
    useChartSchedulers,
} from '../../../../../features/scheduler/hooks/useChartSchedulers';

type Props = {
    chartUuid: string;
    chartName: string;
    agentUuid: string;
    sourceThreadUuid: string;
    onClose: () => void;
};

// Opens the saved chart's scheduled-delivery form straight into create mode,
// pre-filled to run the conversation's agent over the chart and pin the
// originating thread. Mounted only while open so the schedulers query isn't
// fetched for every chat message.
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
                format: SchedulerFormat.IMAGE,
                aiAugmentation: {
                    type: 'agent',
                    agentUuid,
                    sourceThreadUuid,
                    prompt: DEFAULT_AI_AUGMENTATION_PROMPT,
                },
            }}
            onClose={onClose}
        />
    );
};
