import {
    isDashboardChartTileType,
    isDashboardScheduler,
    type DashboardChartTile,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    Box,
    Button,
    List,
    Loader,
    Radio,
    Select,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useDashboardSchedulers } from '../../features/scheduler/hooks/useDashboardSchedulers';
import useToaster from '../../hooks/toaster/useToaster';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import classes from './DeleteTabModal.module.css';

type DeleteProps = ModalProps & {
    tab: DashboardTab;
    dashboardTiles: DashboardTile[] | undefined;
    dashboardTabs: DashboardTab[] | undefined;
    dashboardUuid: string;
    onDeleteTab: (tabUuid: string) => void;
    onMoveTile: (tile: DashboardTile) => void;
};

enum RemoveActions {
    MOVE = 'move',
    DELETE = 'delete',
}

export const TabDeleteModal: FC<DeleteProps> = ({
    opened,
    onClose,
    tab,
    dashboardTiles,
    dashboardTabs,
    dashboardUuid,
    onDeleteTab,
    onMoveTile,
}) => {
    const { t } = useTranslation('dashboard');
    const [removeAction, setRemoveAction] = useState('move');
    const [destinationTabId, setDestinationTabId] = useState<
        string | undefined
    >();

    // Fetch schedulers for this dashboard
    const {
        data: schedulersData,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useDashboardSchedulers({ dashboardUuid });

    const { containerRef: scrollContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching: isFetchingNextPage,
        hasMore: hasNextPage ?? false,
    });

    // Flatten all pages into a single array of schedulers
    const schedulers = useMemo(
        () => schedulersData?.pages.flatMap((page) => page.data) ?? [],
        [schedulersData],
    );

    // Get total count from pagination
    const totalSchedulersCount =
        schedulersData?.pages[0]?.pagination?.totalResults ?? 0;

    // Find schedulers that use this tab
    const affectedSchedulers = useMemo(() => {
        if (!schedulers) return [];

        return schedulers.filter((scheduler) => {
            if (isDashboardScheduler(scheduler) && scheduler.selectedTabs) {
                return scheduler.selectedTabs.includes(tab.uuid);
            }
            return false;
        });
    }, [schedulers, tab.uuid]);

    const destinationTabs = useMemo(
        () =>
            dashboardTabs?.filter((otherTab) => otherTab.uuid !== tab.uuid) ||
            [],
        [dashboardTabs, tab.uuid],
    );

    useEffect(() => {
        if (opened) {
            setRemoveAction(RemoveActions.MOVE);
            const destinationTab =
                destinationTabs.length === 1
                    ? destinationTabs[0].uuid
                    : undefined;
            setDestinationTabId(destinationTab);
        }
    }, [opened, destinationTabs]);

    const { showToastSuccess } = useToaster();

    const isNewSavedChart = (tile: DashboardTile) => {
        return (
            isDashboardChartTileType(tile) && tile.properties.belongsToDashboard
        );
    };

    const tilesToRemove = useMemo(
        () => (dashboardTiles || []).filter((tile) => tile.tabUuid == tab.uuid),
        [tab.uuid, dashboardTiles],
    );

    const newSavedCharts = useMemo(
        () => tilesToRemove.filter(isNewSavedChart) as DashboardChartTile[],
        [tilesToRemove],
    );

    const handleSubmit = useCallback(() => {
        onClose();
        const numTiles = tilesToRemove.length || 0;
        let toastMessage = '';
        if (removeAction === RemoveActions.MOVE) {
            tilesToRemove.forEach((tile) => {
                onMoveTile({
                    ...tile,
                    x: 0,
                    y: 0,
                    tabUuid: destinationTabId,
                });
            });
            toastMessage = t('tabs.deleteModal.toastTransferred', {
                name: tab.name,
                count: numTiles,
            });
        } else {
            toastMessage = t('tabs.deleteModal.toastDeleted', {
                name: tab.name,
                count: numTiles,
            });
        }
        onDeleteTab(tab.uuid);
        showToastSuccess({ title: toastMessage });
    }, [
        onClose,
        tilesToRemove,
        removeAction,
        onDeleteTab,
        tab.uuid,
        tab.name,
        showToastSuccess,
        t,
        onMoveTile,
        destinationTabId,
    ]);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            role="alertdialog"
            title={t('tabs.deleteModal.title')}
            icon={IconTrash}
            actions={
                <Button
                    color={
                        removeAction === RemoveActions.DELETE
                            ? 'red'
                            : undefined
                    }
                    disabled={
                        removeAction === RemoveActions.MOVE && !destinationTabId
                    }
                    onClick={handleSubmit}
                >
                    {removeAction === RemoveActions.MOVE
                        ? t('tabs.deleteModal.transfer')
                        : t('tabs.deleteModal.deleteTiles')}
                </Button>
            }
        >
            <Stack gap="md">
                <Text>{t('tabs.deleteModal.question')}</Text>
                <Radio.Group
                    value={removeAction}
                    onChange={(val: string) => setRemoveAction(val)}
                >
                    <Stack gap="xs" mt={0}>
                        <Radio
                            label={t('tabs.deleteModal.deleteAllOption')}
                            value={RemoveActions.DELETE}
                            styles={{
                                label: {
                                    paddingLeft: 'var(--mantine-spacing-xs)',
                                },
                            }}
                        />
                        <Radio
                            label={t('tabs.deleteModal.transferAllOption')}
                            value={RemoveActions.MOVE}
                            styles={{
                                label: {
                                    paddingLeft: 'var(--mantine-spacing-xs)',
                                },
                            }}
                        />
                        {dashboardTabs?.length &&
                            removeAction === RemoveActions.MOVE && (
                                <Select
                                    placeholder={t(
                                        'tabs.deleteModal.pickTabPlaceholder',
                                    )}
                                    value={destinationTabId}
                                    onChange={(value) =>
                                        setDestinationTabId(value || undefined)
                                    }
                                    data={destinationTabs.map((otherTab) => ({
                                        value: otherTab.uuid,
                                        label: otherTab.name,
                                    }))}
                                    styles={{
                                        root: {
                                            paddingLeft:
                                                'var(--mantine-spacing-xl)',
                                        },
                                    }}
                                />
                            )}
                    </Stack>
                </Radio.Group>

                {affectedSchedulers.length > 0 && (
                    <Callout
                        variant="warning"
                        title={t('tabs.deleteModal.schedulersWarningTitle')}
                    >
                        <Stack gap="xs">
                            <Text size="sm">
                                <Trans
                                    t={t}
                                    i18nKey="tabs.deleteModal.schedulersUsedBy"
                                    count={totalSchedulersCount}
                                    values={{ count: totalSchedulersCount }}
                                    components={{
                                        bold: <Text fw={600} span />,
                                    }}
                                />
                            </Text>
                            <Box
                                ref={scrollContainerRef}
                                mah={150}
                                className={classes.schedulerList}
                                onScroll={onScroll}
                            >
                                <List size="sm">
                                    {affectedSchedulers.map((scheduler) => (
                                        <List.Item
                                            key={scheduler.schedulerUuid}
                                        >
                                            <Text size="sm">
                                                {scheduler.name}
                                            </Text>
                                        </List.Item>
                                    ))}
                                </List>
                                {isFetchingNextPage && (
                                    <Stack align="center" mt="xs">
                                        <Loader size="xs" />
                                    </Stack>
                                )}
                            </Box>
                        </Stack>
                    </Callout>
                )}

                {removeAction === RemoveActions.DELETE && (
                    <>
                        <Text>
                            <Trans
                                t={t}
                                i18nKey="tabs.deleteModal.confirmDelete"
                                count={tilesToRemove.length}
                                values={{
                                    name: tab.name,
                                    count: tilesToRemove.length,
                                }}
                                components={{ bold: <b /> }}
                            />
                        </Text>
                        {newSavedCharts.length > 0 && (
                            <Stack gap="xs">
                                <Text>
                                    {t('tabs.deleteModal.alsoDeletesCharts', {
                                        count: newSavedCharts.length,
                                    })}
                                </Text>
                                <List size="sm" pr={20}>
                                    {newSavedCharts.map((tile) => (
                                        <List.Item key={tile.uuid}>
                                            <Text>
                                                {tile.properties.chartName}
                                            </Text>
                                        </List.Item>
                                    ))}
                                </List>
                            </Stack>
                        )}
                    </>
                )}
            </Stack>
        </MantineModal>
    );
};
