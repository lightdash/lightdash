import {
    type ApiDashboardPaginatedSchedulersResponse,
    type ApiError,
    type ApiSavedChartPaginatedSchedulersResponse,
    type ItemsMap,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    TextInput,
} from '@mantine-8/core';
import { IconBell, IconSearch, IconSend, IconX } from '@tabler/icons-react';
import { type UseInfiniteQueryResult } from '@tanstack/react-query';
import React, { useState, type FC } from 'react';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import MantineIcon from '../../../components/common/MantineIcon';
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
        schedulersQuery: UseInfiniteQueryResult<
            | ApiSavedChartPaginatedSchedulersResponse['results']
            | ApiDashboardPaginatedSchedulersResponse['results'],
            ApiError
        >;
        /** If provided, opens directly in edit mode for this scheduler */
        initialSchedulerUuid?: string;
        searchQuery?: string;
        onSearchQueryChange?: (searchQuery: string | undefined) => void;
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
    searchQuery,
    onSearchQueryChange,
}) => {
    const [modalState, setModalState] = useState<States>(
        initialSchedulerUuid ? States.EDIT : States.LIST,
    );
    const [schedulerUuidToEdit, setSchedulerUuidToEdit] = useState<
        string | undefined
    >(initialSchedulerUuid);

    const { isFetching, isInitialLoading, data } = schedulersQuery;
    const hasSchedulers =
        (data?.pages.flatMap((page) => page.data) ?? []).length > 0;
    const showSearchBar =
        onSearchQueryChange && (Boolean(searchQuery) || hasSchedulers);

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
                        <DocumentationHelpButton href="https://docs.lightdash.com/guides/how-to-create-alerts" />
                    ) : (
                        <DocumentationHelpButton href="https://docs.lightdash.com/guides/how-to-create-scheduled-deliveries" />
                    )
                }
                modalBodyProps={{ bg: 'background' }}
                actions={<Actions />}
                cancelLabel={false}
            >
                <Stack gap="md" mih={220}>
                    {showSearchBar && (
                        <TextInput
                            placeholder={`Search ${
                                isThresholdAlert
                                    ? 'alerts'
                                    : 'scheduled deliveries'
                            }...`}
                            leftSection={<MantineIcon icon={IconSearch} />}
                            rightSection={
                                isFetching && !isInitialLoading ? (
                                    <Loader size={14} />
                                ) : (
                                    searchQuery && (
                                        <ActionIcon
                                            onClick={() =>
                                                onSearchQueryChange?.(undefined)
                                            }
                                            variant="transparent"
                                            size="xs"
                                            color="ldGray.5"
                                        >
                                            <MantineIcon icon={IconX} />
                                        </ActionIcon>
                                    )
                                )
                            }
                            value={searchQuery ?? ''}
                            onChange={(e) =>
                                onSearchQueryChange?.(
                                    e.currentTarget.value || undefined,
                                )
                            }
                        />
                    )}
                    <Box>
                        <SchedulersList
                            schedulersQuery={schedulersQuery}
                            isThresholdAlertList={isThresholdAlert}
                            isSearching={Boolean(searchQuery)}
                            onEdit={(schedulerUuid) => {
                                setModalState(States.EDIT);
                                setSchedulerUuidToEdit(schedulerUuid);
                            }}
                        />
                    </Box>
                </Stack>
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
