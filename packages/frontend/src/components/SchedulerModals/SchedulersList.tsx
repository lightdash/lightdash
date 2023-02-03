import { NonIdealState, Spinner } from '@blueprintjs/core';
import { ApiError, Scheduler } from '@lightdash/common';
import React, { FC } from 'react';
import { UseQueryResult } from 'react-query/types/react/types';
import ErrorState from '../common/ErrorState';
import SchedulersListItem from './SchedulersListItem';

type Props = {
    schedulersQuery: UseQueryResult<Scheduler[], ApiError>;
    onEdit: (schedulerUuid: string) => void;
};

const SchedulersList: FC<Props> = ({ schedulersQuery, onEdit }) => {
    const { data: schedulers, isLoading, error } = schedulersQuery;

    if (isLoading) {
        return <NonIdealState title="Loading schedulers" icon={<Spinner />} />;
    }
    if (error) {
        return <ErrorState error={error.error} />;
    }
    if (!schedulers || schedulers.length <= 0) {
        return (
            <p>
                There are no existing scheduled deliveries. Add one by clicking
                on "Create new" bellow.
            </p>
        );
    }
    return (
        <div>
            {schedulers.map((scheduler) => (
                <SchedulersListItem
                    key={scheduler.schedulerUuid}
                    scheduler={scheduler}
                    onEdit={onEdit}
                    onDelete={() => undefined}
                />
            ))}
        </div>
    );
};

export default SchedulersList;
