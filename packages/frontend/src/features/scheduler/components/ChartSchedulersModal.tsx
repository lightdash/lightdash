import { DialogProps } from '@blueprintjs/core';
import React, { FC } from 'react';
import {
    useChartSchedulerCreateMutation,
    useChartSchedulers,
} from '../hooks/useChartSchedulers';
import SchedulersModalBase from './SchedulerModalBase';

interface Props extends DialogProps {
    chartUuid: string;
    name: string;
}

export const ChartSchedulersModal: FC<Props> = ({
    chartUuid,
    name,
    ...modalProps
}) => {
    const chartSchedulersQuery = useChartSchedulers(chartUuid);
    const createMutation = useChartSchedulerCreateMutation();
    return (
        <SchedulersModalBase
            resourceUuid={chartUuid}
            name={name}
            schedulersQuery={chartSchedulersQuery}
            createMutation={createMutation}
            isChart
            {...modalProps}
        />
    );
};
