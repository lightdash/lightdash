import {
    ApiError,
    SchedulerAndTargets,
    SchedulerFormat,
} from '@lightdash/common';
import { Loader, Stack, Text, Title } from '@mantine/core';
import { UseQueryResult } from '@tanstack/react-query';
import React, { FC, useState } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import { SchedulerDeleteModal } from './SchedulerDeleteModal';
import SchedulersListItem from './SchedulersListItem';

type Props = {
    schedulersQuery: UseQueryResult<SchedulerAndTargets[], ApiError>;
    onEdit: (schedulerUuid: string) => void;
};

const SchedulersList: FC<Props> = ({ schedulersQuery, onEdit }) => {
    const { data: schedulers, isInitialLoading, error } = schedulersQuery;
    const [schedulerUuid, setSchedulerUuid] = useState<string>();

    if (isInitialLoading) {
        return (
            <Stack h={300} w="100%" align="center">
                <Text fw={600}>Loading schedulers</Text>
                <Loader size="lg" />
            </Stack>
        );
    }
    if (error) {
        return <ErrorState error={error.error} />;
    }
    if (!schedulers || schedulers.length <= 0) {
        return (
            <Stack color="gray" align="center" mt="xxl">
                <Title order={4} color="gray.6">
                    There are no existing scheduled deliveries
                </Title>
                <Text color="gray.6">
                    Add one by clicking on "Create new" below
                </Text>
            </Stack>
        );
    }
    return (
        <div>
            {schedulers.map(
                (scheduler) =>
                    scheduler.format !== SchedulerFormat.GSHEETS && (
                        <SchedulersListItem
                            key={scheduler.schedulerUuid}
                            scheduler={scheduler}
                            onEdit={onEdit}
                            onDelete={setSchedulerUuid}
                        />
                    ),
            )}
            {schedulerUuid && (
                <SchedulerDeleteModal
                    opened={true}
                    schedulerUuid={schedulerUuid}
                    onConfirm={() => setSchedulerUuid(undefined)}
                    onClose={() => setSchedulerUuid(undefined)}
                />
            )}
        </div>
    );
};

export default SchedulersList;
