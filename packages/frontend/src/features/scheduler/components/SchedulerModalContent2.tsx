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

import { IconChevronLeft, IconSend } from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';
import SchedulerForm2 from './SchedulerForm2';
import { UpdateStateContent } from './SchedulerModalContent';

enum States {
    LIST,
    CREATE,
    EDIT,
}

interface FooterProps {
    confirmText?: string;
    onBack?: () => void;
    onSendNow?: () => void;
    onCancel?: () => void;
    onConfirm?: () => void;
    loading?: boolean;
}

const ScheduledDeliveriesFooter = ({
    confirmText = 'Confirm',
    onBack,
    onCancel,
    onSendNow,
    onConfirm,
    loading,
}: FooterProps) => {
    return (
        <Group
            position="apart"
            sx={(theme) => ({
                position: 'sticky',
                backgroundColor: 'white',
                borderTop: `1px solid ${theme.colors.gray[4]}`,
                bottom: 0,
                padding: theme.spacing.md,
            })}
        >
            {!!onBack ? (
                <Button
                    onClick={onBack}
                    variant="subtle"
                    leftIcon={<MantineIcon icon={IconChevronLeft} />}
                >
                    Back
                </Button>
            ) : (
                <Box />
            )}
            <Group>
                {!!onCancel && (
                    <Button onClick={onCancel} variant="outline">
                        Cancel
                    </Button>
                )}
                {!!onSendNow && (
                    <Button
                        variant="light"
                        leftIcon={<MantineIcon icon={IconSend} />}
                        onClick={onSendNow}
                    >
                        Send now
                    </Button>
                )}
                <Button type="submit" loading={loading} onClick={onConfirm}>
                    {confirmText}
                </Button>
            </Group>
        </Group>
    );
};

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
            <ScheduledDeliveriesFooter
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
}> = ({ resourceUuid, createMutation, onBack }) => {
    useEffect(() => {
        if (createMutation.isSuccess) {
            createMutation.reset();
            onBack();
        }
    }, [createMutation, createMutation.isSuccess, onBack]);
    const handleSubmit = (data: CreateSchedulerAndTargetsWithoutIds) => {
        createMutation.mutate({ resourceUuid, data });
    };
    return (
        <SchedulerForm2
            disabled={createMutation.isLoading}
            onSubmit={handleSubmit}
            footer={
                <ScheduledDeliveriesFooter
                    confirmText="Create schedule"
                    onBack={onBack}
                    onSendNow={() => {
                        //TODO: implement send now
                    }}
                    loading={createMutation.isLoading}
                />
            }
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
