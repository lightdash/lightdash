import {
    type ApiError,
    type ItemsMap,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { Box, Button, Group } from '@mantine-8/core';
import { IconBell, IconSend } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import React, { useEffect, useState, type FC } from 'react';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import MantineModal from '../../../components/common/MantineModal';
import { useMantineModalStack } from '../../../components/common/MantineModal/useMantineModalStack';
import { States } from '../utils';
import { SchedulerModalCreateOrEdit } from './SchedulerModalCreateOrEdit';
import SchedulersList from './SchedulersList';

export const SchedulerModal: FC<
    Pick<
        React.ComponentProps<typeof SchedulerModalCreateOrEdit>,
        | 'resourceUuid'
        | 'createMutation'
        | 'isChart'
        | 'currentParameterValues'
        | 'availableParameters'
    > & {
        name: string;
        onClose?: () => void;
        isOpen?: boolean;
        isThresholdAlert?: boolean;
        itemsMap?: ItemsMap;
        schedulersQuery: UseQueryResult<SchedulerAndTargets[], ApiError>;
    }
> = ({
    resourceUuid,
    schedulersQuery,
    createMutation,
    isOpen = false,
    isChart,
    isThresholdAlert,
    itemsMap,
    currentParameterValues,
    availableParameters,
    onClose = () => {},
}) => {
    const stack = useMantineModalStack(['list', 'createOrEdit'] as const);
    const [modalState, setModalState] = useState<States>(States.LIST);
    const [schedulerUuidToEdit, setSchedulerUuidToEdit] = useState<
        string | undefined
    >();

    const { open, state, closeAll } = stack;

    // Sync external isOpen prop with the list modal
    useEffect(() => {
        if (isOpen && !state.list) {
            open('list');
        } else if (!isOpen && (state.list || state.createOrEdit)) {
            closeAll();
        }
    }, [isOpen, state.list, state.createOrEdit, open, closeAll]);

    // Handle closing all modals
    const handleClose = () => {
        stack.closeAll();
        onClose();
    };

    // Handle opening create modal
    const handleCreate = () => {
        setModalState(States.CREATE);
        stack.close('list');
        stack.open('createOrEdit');
    };

    // Handle opening edit modal
    const handleEdit = (schedulerUuid: string) => {
        setModalState(States.EDIT);
        setSchedulerUuidToEdit(schedulerUuid);
        stack.close('list');
        stack.open('createOrEdit');
    };

    // Handle going back from create/edit to list
    const handleBack = () => {
        setModalState(States.LIST);
        stack.close('createOrEdit');
        stack.open('list');
    };

    const Actions = () => {
        if (modalState === States.LIST) {
            return (
                <Group>
                    <Button variant="default" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate}>Create new</Button>
                </Group>
            );
        }

        return null;
    };

    const listModalProps = stack.register('list');

    return (
        <>
            <MantineModal
                opened={listModalProps.opened}
                onClose={handleClose}
                size="xl"
                title={isThresholdAlert ? 'Alerts' : 'Scheduled deliveries'}
                icon={isThresholdAlert ? IconBell : IconSend}
                headerActions={
                    isThresholdAlert ? (
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/guides/how-to-create-alerts"
                            pos="relative"
                            top="2px"
                        />
                    ) : (
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/guides/how-to-create-scheduled-deliveries"
                            pos="relative"
                            top="2px"
                        />
                    )
                }
                modalBodyProps={{ bg: 'background' }}
                actions={<Actions />}
                cancelLabel={false}
            >
                <Box mih={220}>
                    <SchedulersList
                        schedulersQuery={schedulersQuery}
                        isThresholdAlertList={isThresholdAlert}
                        onEdit={handleEdit}
                    />
                </Box>
            </MantineModal>

            {(modalState === States.EDIT || modalState === States.CREATE) && (
                <SchedulerModalCreateOrEdit
                    resourceUuid={resourceUuid}
                    schedulerUuidToEdit={
                        modalState === States.EDIT
                            ? schedulerUuidToEdit
                            : undefined
                    }
                    createMutation={createMutation}
                    opened={stack.state.createOrEdit}
                    onClose={handleClose}
                    onBack={handleBack}
                    isChart={isChart}
                    isThresholdAlert={isThresholdAlert}
                    itemsMap={itemsMap}
                    currentParameterValues={currentParameterValues}
                    availableParameters={availableParameters}
                />
            )}
        </>
    );
};
