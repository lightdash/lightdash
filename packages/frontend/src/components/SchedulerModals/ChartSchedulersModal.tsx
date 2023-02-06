import { DialogProps } from '@blueprintjs/core';
import React, { FC } from 'react';
import {
    useChartSchedulers,
    useChartSchedulersCreateMutation,
} from '../../hooks/scheduler/useChartSchedulers';
import SchedulersModalBase from './SchedulersModalBase';

interface Props extends DialogProps {
    chartUuid: string;
    name: string;
}

const ChartSchedulersModal: FC<Props> = ({
    chartUuid,
    name,
    ...modalProps
}) => {
    const chartSchedulersQuery = useChartSchedulers(chartUuid);
    const createMutation = useChartSchedulersCreateMutation();
    return (
        <SchedulersModalBase
            resourceUuid={chartUuid}
            name={name}
            schedulersQuery={chartSchedulersQuery}
            createMutation={createMutation}
            {...modalProps}
        />
    );
};

export default ChartSchedulersModal;
