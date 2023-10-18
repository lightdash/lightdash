import {
    ApiError,
    CreateSchedulerAndTargets,
    CreateSchedulerAndTargetsWithoutIds,
    SchedulerAndTargets,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { FC, useCallback, useEffect, useState } from 'react';
import {
    UseMutationResult,
    UseQueryResult,
} from 'react-query/types/react/types';
import { useHistory, useLocation } from 'react-router-dom';
import { getSchedulerUuidFromUrlParams } from '../utils';
import SchedulersList from './SchedulersList';

import useUser from '../../../hooks/user/useUser';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useSendNowScheduler } from '../hooks/useScheduler';
import SchedulerForm2 from './SchedulerForm2';
import { UpdateStateContent } from './SchedulerModalContent';
import SchedulersModalFooter from './SchedulerModalFooter';

enum States {
    LIST,
    CREATE,
    EDIT,
}

const ListStateContent: FC<{
    schedulersQuery: UseQueryResult<SchedulerAndTargets[], ApiError>;
    onClose: () => void;
    onConfirm: () => void;
    onEdit: (schedulerUuid: string) => void;
}> = ({ schedulersQuery, onClose, onConfirm, onEdit }) => {
    return (
        <>
            <Box
                py="sm"
                mih={220}
                px="md"
                sx={(theme) => ({ backgroundColor: theme.colors.gray[2] })}
            >
                <SchedulersList
                    schedulersQuery={schedulersQuery}
                    onEdit={onEdit}
                />
            </Box>
            <SchedulersModalFooter
                confirmText="Create new"
                onConfirm={onConfirm}
                onCancel={onClose}
            />
        </>
    );
};

const CreateStateContent: FC<{
    resourceUuid: string;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    isChart: boolean;
    onBack: () => void;
}> = ({ resourceUuid, createMutation, isChart, onBack }) => {
    useEffect(() => {
        if (createMutation.isSuccess) {
            createMutation.reset();
            onBack();
        }
    }, [createMutation, createMutation.isSuccess, onBack]);
    const handleSubmit = (data: CreateSchedulerAndTargetsWithoutIds) => {
        createMutation.mutate({ resourceUuid, data });
    };
    const { data: user } = useUser(true);
    const { track } = useTracking();
    const { mutate: sendNow } = useSendNowScheduler();

    const handleSendNow = useCallback(
        (schedulerData: CreateSchedulerAndTargetsWithoutIds) => {
            if (user?.userUuid === undefined) return;
            const resource = isChart
                ? {
                      savedChartUuid: resourceUuid,
                      dashboardUuid: null,
                  }
                : {
                      dashboardUuid: resourceUuid,
                      savedChartUuid: null,
                  };
            const unsavedScheduler: CreateSchedulerAndTargets = {
                ...schedulerData,
                ...resource,
                createdBy: user.userUuid,
            };
            track({
                name: EventName.SCHEDULER_SEND_NOW_BUTTON,
            });
            sendNow(unsavedScheduler);
        },
        [isChart, resourceUuid, track, sendNow, user],
    );

    return (
        <SchedulerForm2
            disabled={createMutation.isLoading}
            onSubmit={handleSubmit}
            confirmText="Create schedule"
            onBack={onBack}
            onSendNow={handleSendNow}
            loading={createMutation.isLoading}
        />
    );
};

interface Props {
    resourceUuid: string;
    schedulersQuery: UseQueryResult<SchedulerAndTargets[], ApiError>;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    onClose: () => void;
    isChart: boolean;
}

const SchedulerModalContent2: FC<Omit<Props, 'name'>> = ({
    resourceUuid,
    schedulersQuery,
    createMutation,
    isChart,
    onClose = () => {},
}) => {
    const [state, setState] = useState<States>(States.LIST);
    const [schedulerUuid, setSchedulerUuid] = useState<string | undefined>();
    const history = useHistory();
    const { search, pathname } = useLocation();

    useEffect(() => {
        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        if (schedulerUuidFromUrlParams) {
            setState(States.EDIT);
            setSchedulerUuid(schedulerUuidFromUrlParams);

            // remove from url param after modal is open
            const newParams = new URLSearchParams(search);
            newParams.delete('scheduler_uuid');
            history.replace({
                pathname,
                search: newParams.toString(),
            });
        }
    }, [history, pathname, search]);

    return (
        <>
            {state === States.LIST && (
                <ListStateContent
                    schedulersQuery={schedulersQuery}
                    onClose={onClose}
                    onConfirm={() => setState(States.CREATE)}
                    onEdit={(schedulerUuidToUpdate) => {
                        setState(States.EDIT);
                        setSchedulerUuid(schedulerUuidToUpdate);
                    }}
                />
            )}
            {state === States.CREATE && (
                <CreateStateContent
                    resourceUuid={resourceUuid}
                    createMutation={createMutation}
                    isChart={isChart}
                    onBack={() => setState(States.LIST)}
                />
            )}
            {state === States.EDIT && schedulerUuid && (
                <UpdateStateContent
                    schedulerUuid={schedulerUuid}
                    onBack={() => setState(States.LIST)}
                />
            )}
        </>
    );
};

export default SchedulerModalContent2;
