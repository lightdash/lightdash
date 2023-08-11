import { NonIdealState, Spinner } from '@blueprintjs/core';
import { ApiError, SchedulerAndTargets } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { UseQueryResult } from 'react-query/types/react/types';
import ErrorState from '../../common/ErrorState';
import SchedulerDeleteModal from './SchedulerDeleteModal';
import SchedulersListItem from './SchedulersListItem';

type Props = {
    schedulersQuery: UseQueryResult<SchedulerAndTargets[], ApiError>;
    onEdit: (schedulerUuid: string) => void;
};

const SchedulersList: FC<Props> = ({ schedulersQuery, onEdit }) => {
    const { data: schedulers, isLoading, error } = schedulersQuery;
    const [schedulerUuid, setSchedulerUuid] = useState<string>();

    if (isLoading) {
        return <NonIdealState title="Loading schedulers" icon={<Spinner />} />;
    }
    if (error) {
        return <ErrorState error={error.error} />;
    }
    if (!schedulers || schedulers.length <= 0) {
        return (
            <NonIdealState
                title="There are no existing scheduled deliveries"
                description='Add one by clicking on "Create new" below'
                icon={'blank'}
            />
        );
    }
    return (
        <div>
            {schedulers.map((scheduler) => (
                <SchedulersListItem
                    key={scheduler.schedulerUuid}
                    scheduler={scheduler}
                    onEdit={onEdit}
                    onDelete={setSchedulerUuid}
                />
            ))}
            {schedulerUuid && (
                <SchedulerDeleteModal
                    lazy={true}
                    isOpen={true}
                    schedulerUuid={schedulerUuid}
                    onConfirm={() => setSchedulerUuid(undefined)}
                    onClose={() => setSchedulerUuid(undefined)}
                />
            )}
        </div>
    );
};

export default SchedulersList;
