import {
    type ApiError,
    type ApiSavedChartPaginatedSchedulersResponse,
    type ItemsMap,
    type SchedulerAndTargets,
    type SchedulerRun,
    type SchedulerRunLog,
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
import React, { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import RunDetailsModal from '../../../components/SchedulersView/RunDetailsModal';
import { useGetSlackChannelName } from '../../../hooks/slack/useGetSlackChannelName';
import useToaster from '../../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useFetchRunLogs } from '../hooks/useScheduler';
import { States } from '../utils';
import { SchedulerModalCreateOrEdit } from './SchedulerModalCreateOrEdit';
import SchedulerRunsHistoryModal from './SchedulerRunsHistoryModal';
import SchedulersList from './SchedulersList';

type HistoryContext = {
    schedulerUuid: string;
    schedulerName: string;
    resourceType: 'dashboard' | 'chart';
    resourceUuid: string;
};

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
            ApiSavedChartPaginatedSchedulersResponse['results'],
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
    const [historyContext, setHistoryContext] = useState<HistoryContext | null>(
        null,
    );
    const { activeProjectUuid } = useActiveProjectUuid();
    const [selectedRun, setSelectedRun] = useState<SchedulerRun | null>(null);
    const [childLogsMap, setChildLogsMap] = useState<
        Map<string, SchedulerRunLog[]>
    >(new Map());

    const { isFetching, isInitialLoading, data } = schedulersQuery;
    const hasSchedulers =
        (data?.pages.flatMap((page) => page.data) ?? []).length > 0;
    const showSearchBar =
        onSearchQueryChange && (Boolean(searchQuery) || hasSchedulers);

    const handleViewHistory = useCallback((scheduler: SchedulerAndTargets) => {
        const ctx: HistoryContext | null = scheduler.dashboardUuid
            ? {
                  schedulerUuid: scheduler.schedulerUuid,
                  schedulerName: scheduler.name,
                  resourceType: 'dashboard',
                  resourceUuid: scheduler.dashboardUuid,
              }
            : scheduler.savedChartUuid
              ? {
                    schedulerUuid: scheduler.schedulerUuid,
                    schedulerName: scheduler.name,
                    resourceType: 'chart',
                    resourceUuid: scheduler.savedChartUuid,
                }
              : null;
        if (!ctx) return;
        setHistoryContext(ctx);
        setModalState(States.VIEW_HISTORY);
    }, []);

    // Slack channel name resolution for the run details view
    const slackChannelIds = useMemo(() => {
        if (!selectedRun?.details || typeof selectedRun.details !== 'object') {
            return undefined;
        }
        const channel = (selectedRun.details as Record<string, unknown>)
            .channel;
        return typeof channel === 'string' ? [channel] : undefined;
    }, [selectedRun]);
    const { getSlackChannelName } = useGetSlackChannelName({
        includeChannelIds: slackChannelIds,
        enabled: modalState === States.VIEW_RUN_DETAILS,
    });

    const fetchRunLogsMutation = useFetchRunLogs();
    const { showToastError } = useToaster();
    const handleSelectRun = useCallback(
        (run: SchedulerRun) => {
            setSelectedRun(run);
            setModalState(States.VIEW_RUN_DETAILS);
            if (!childLogsMap.has(run.runId)) {
                void fetchRunLogsMutation
                    .mutateAsync(run.runId)
                    .then((childLogs) => {
                        setChildLogsMap((prev) => {
                            const next = new Map(prev);
                            next.set(run.runId, childLogs);
                            return next;
                        });
                    })
                    .catch((error) => {
                        showToastError({
                            title: 'Failed to load run details',
                            subtitle:
                                error instanceof Error
                                    ? error.message
                                    : undefined,
                        });
                    });
            }
        },
        [childLogsMap, fetchRunLogsMutation, showToastError],
    );

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
                            onViewHistory={handleViewHistory}
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

    if (
        modalState === States.VIEW_HISTORY &&
        historyContext &&
        activeProjectUuid
    ) {
        return (
            <SchedulerRunsHistoryModal
                onBack={() => setModalState(States.LIST)}
                onClose={onClose}
                onSelectRun={handleSelectRun}
                resourceType={historyContext.resourceType}
                resourceUuid={historyContext.resourceUuid}
                schedulerUuid={historyContext.schedulerUuid}
                schedulerName={historyContext.schedulerName}
                projectUuid={activeProjectUuid}
            />
        );
    }

    if (modalState === States.VIEW_RUN_DETAILS && selectedRun) {
        return (
            <RunDetailsModal
                opened
                onClose={onClose}
                onBack={() => setModalState(States.VIEW_HISTORY)}
                run={selectedRun}
                childLogs={childLogsMap.get(selectedRun.runId)}
                isLoading={
                    !childLogsMap.has(selectedRun.runId) &&
                    fetchRunLogsMutation.isLoading
                }
                getSlackChannelName={getSlackChannelName}
            />
        );
    }

    return null;
};

export default SchedulersModal;
