import { DialogProps } from '@blueprintjs/core';
import React, { FC } from 'react';
import {
    useDashboardSchedulerCreateMutation,
    useDashboardSchedulers,
} from '../../hooks/scheduler/useDashboardSchedulers';
import SchedulersModalBase from './SchedulerModalBase';

interface Props extends DialogProps {
    dashboardUuid: string;
    name: string;
}

const DashboardSchedulersModal: FC<Props> = ({
    dashboardUuid,
    name,
    ...modalProps
}) => {
    const schedulersQuery = useDashboardSchedulers(dashboardUuid);
    const createMutation = useDashboardSchedulerCreateMutation();
    return (
        <SchedulersModalBase
            resourceUuid={dashboardUuid}
            name={name}
            schedulersQuery={schedulersQuery}
            createMutation={createMutation}
            {...modalProps}
        />
    );
};

export default DashboardSchedulersModal;
