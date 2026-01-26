import {
    type ApiDashboardSchedulersResponse,
    type ApiError,
    type ApiSavedChartSchedulersResponse,
    type ItemsMap,
} from '@lightdash/common';
import { Box, Button, Group } from '@mantine-8/core';
import { IconBell, IconSend } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import React, { useState, type FC } from 'react';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import MantineModal from '../../../components/common/MantineModal';
import { States } from '../utils';
import { SchedulerModalCreateOrEdit } from './SchedulerModalCreateOrEdit';
import SchedulersList from './SchedulersList';

const SchedulersModal: FC<
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
        schedulersQuery: UseQueryResult<
            | ApiSavedChartSchedulersResponse['results']
            | ApiDashboardSchedulersResponse['results'],
            ApiError
        >;
        /** If provided, opens directly in edit mode for this scheduler */
        initialSchedulerUuid?: string;
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
    initialSchedulerUuid,
}) => {
    const [modalState, setModalState] = useState<States>(
        initialSchedulerUuid ? States.EDIT : States.LIST,
    );
    const [schedulerUuidToEdit, setSchedulerUuidToEdit] = useState<
        string | undefined
    >(initialSchedulerUuid);
    const Actions = () => {
        if (modalState === States.LIST) {
            return (
                <Group>
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => setModalState(States.CREATE)}>
                        Create new
                    </Button>
                </Group>
            );
        }

        return null;
    };

    if (modalState === States.LIST) {
        return (
            <MantineModal
                opened={isOpen}
                onClose={onClose}
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
                        onEdit={(schedulerUuid) => {
                            setModalState(States.EDIT);
                            setSchedulerUuidToEdit(schedulerUuid);
                        }}
                    />
                </Box>
            </MantineModal>
        );
    }

    if (modalState === States.EDIT || modalState === States.CREATE) {
        return (
            <SchedulerModalCreateOrEdit
                resourceUuid={resourceUuid}
                schedulerUuidToEdit={
                    modalState === States.EDIT ? schedulerUuidToEdit : undefined
                }
                createMutation={createMutation}
                onClose={onClose}
                onBack={() => setModalState(States.LIST)}
                isChart={isChart}
                isThresholdAlert={isThresholdAlert}
                itemsMap={itemsMap}
                currentParameterValues={currentParameterValues}
                availableParameters={availableParameters}
            />
        );
    }

    return null;
};

export default SchedulersModal;
