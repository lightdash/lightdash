import { DialogProps } from '@blueprintjs/core';
import {
    ApiError,
    CreateSchedulerAndTargetsWithoutIds,
    SchedulerAndTargets,
} from '@lightdash/common';
import { Box, Button, Group } from '@mantine/core';
import { FC, useEffect, useState } from 'react';
import {
    UseMutationResult,
    UseQueryResult,
} from 'react-query/types/react/types';
import { useHistory, useLocation } from 'react-router-dom';
import { getSchedulerUuidFromUrlParams } from '../utils';
import SchedulersList from './SchedulersList';

import {
    CreateStateContent,
    UpdateStateContent,
} from './SchedulerModalContent';

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
            <Box py="sm" mih={220}>
                <SchedulersList
                    schedulersQuery={schedulersQuery}
                    onEdit={onEdit}
                />
            </Box>
            <Group
                spacing="xs"
                position="right"
                // TODO: this css is basically a sticky-footer setup for Mantine modals.
                // It should be shared somewhere else.
                sx={(theme) => ({
                    position: 'sticky',
                    backgroundColor: 'white',
                    border: `1px solid ${theme.colors.gray[4]}`,
                    bottom: 0,
                    margin: `-${theme.spacing.md}`,
                    padding: theme.spacing.md,
                })}
            >
                <Button onClick={onClose} variant="outline">
                    Cancel
                </Button>
                <Button onClick={onConfirm} type="submit">
                    Create new
                </Button>
            </Group>
        </>
    );
};

interface Props extends DialogProps {
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
