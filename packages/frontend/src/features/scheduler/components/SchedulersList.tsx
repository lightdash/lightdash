import {
    SchedulerFormat,
    type ApiDashboardPaginatedSchedulersResponse,
    type ApiError,
    type ApiSavedChartPaginatedSchedulersResponse,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { Box, Loader, Stack, Text, Title } from '@mantine-8/core';
import { type UseInfiniteQueryResult } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import ErrorState from '../../../components/common/ErrorState';
import { SchedulerDeleteModal } from './SchedulerDeleteModal';
import SchedulersListItem from './SchedulersListItem';

type Props = {
    schedulersQuery: UseInfiniteQueryResult<
        | ApiSavedChartPaginatedSchedulersResponse['results']
        | ApiDashboardPaginatedSchedulersResponse['results'],
        ApiError
    >;
    isThresholdAlertList?: boolean;
    isSearching?: boolean;
    onEdit: (schedulerUuid: string) => void;
};

const SchedulersList: FC<Props> = ({
    schedulersQuery,
    onEdit,
    isThresholdAlertList,
    isSearching = false,
}) => {
    const {
        data,
        isInitialLoading,
        error,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = schedulersQuery;
    const [schedulerUuid, setSchedulerUuid] = useState<string>();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Callback to fetch more data when scrolling near the bottom
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                // Load more when within 200px of the bottom
                if (
                    scrollHeight - scrollTop - clientHeight < 200 &&
                    !isFetchingNextPage &&
                    hasNextPage
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetchingNextPage, hasNextPage],
    );

    // Scroll to top when search changes
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [isSearching]);

    // Check on mount if container needs initial fetch
    useEffect(() => {
        fetchMoreOnBottomReached(scrollContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    // Flatten all pages into a single array of schedulers
    const schedulers = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const { deliverySchedulers, alertSchedulers } = schedulers.reduce<{
        deliverySchedulers: SchedulerAndTargets[];
        alertSchedulers: SchedulerAndTargets[];
    }>(
        (acc, scheduler) => {
            if (scheduler.thresholds && scheduler.thresholds.length > 0) {
                acc.alertSchedulers.push(scheduler);
            } else {
                acc.deliverySchedulers.push(scheduler);
            }
            return acc;
        },
        { deliverySchedulers: [], alertSchedulers: [] },
    );

    const relevantSchedulers = isThresholdAlertList
        ? alertSchedulers
        : deliverySchedulers;
    const hasNoResults = relevantSchedulers.length === 0;

    const renderEmptyState = () => {
        if (isSearching) {
            return (
                <Stack align="center" mt="xxl">
                    <Title order={4} c="ldGray.6">
                        No results found
                    </Title>
                    <Text c="ldGray.6">Try adjusting your search</Text>
                </Stack>
            );
        }

        return (
            <Stack align="center" mt="xxl">
                <Title order={4} c="ldGray.6">
                    {`There are no existing ${
                        isThresholdAlertList ? 'alerts' : 'scheduled deliveries'
                    }`}
                </Title>
                <Text c="ldGray.6">
                    Add one by clicking on "Create new" below
                </Text>
            </Stack>
        );
    };

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

    if (hasNoResults) {
        return renderEmptyState();
    }

    return (
        <>
            <Box
                ref={scrollContainerRef}
                mah={400}
                style={{ overflowY: 'auto' }}
                onScroll={(e) =>
                    fetchMoreOnBottomReached(e.target as HTMLDivElement)
                }
            >
                {isThresholdAlertList
                    ? alertSchedulers?.map((alertScheduler) => (
                          <SchedulersListItem
                              key={alertScheduler.schedulerUuid}
                              scheduler={alertScheduler}
                              onEdit={onEdit}
                              onDelete={setSchedulerUuid}
                          />
                      ))
                    : deliverySchedulers
                          .filter(
                              (scheduler) =>
                                  scheduler.format !== SchedulerFormat.GSHEETS,
                          )
                          .map((scheduler) => (
                              <SchedulersListItem
                                  key={scheduler.schedulerUuid}
                                  scheduler={scheduler}
                                  onEdit={onEdit}
                                  onDelete={setSchedulerUuid}
                              />
                          ))}

                {isFetchingNextPage && (
                    <Stack align="center" mt="md">
                        <Loader size="sm" />
                    </Stack>
                )}
            </Box>

            {schedulerUuid && (
                <SchedulerDeleteModal
                    opened
                    schedulerUuid={schedulerUuid}
                    onConfirm={() => setSchedulerUuid(undefined)}
                    onClose={() => setSchedulerUuid(undefined)}
                />
            )}
        </>
    );
};

export default SchedulersList;
