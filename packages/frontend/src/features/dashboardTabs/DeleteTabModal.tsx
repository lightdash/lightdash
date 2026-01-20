import {
    isDashboardChartTileType,
    isDashboardScheduler,
    type DashboardChartTile,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    Button,
    List,
    Radio,
    Select,
    Stack,
    Text,
    type ModalProps,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useDashboardSchedulers } from '../../features/scheduler/hooks/useDashboardSchedulers';
import useToaster from '../../hooks/toaster/useToaster';

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
    const [removeAction, setRemoveAction] = useState('move');
    const [destinationTabId, setDestinationTabId] = useState<
        string | undefined
    >();

    // Fetch schedulers for this dashboard
    const { data: schedulers } = useDashboardSchedulers(dashboardUuid);

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

    const pluralTiles = tilesToRemove.length === 1 ? '' : 's';
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
            toastMessage = `Tab "${tab.name}" was removed and ${numTiles} tile${
                pluralTiles ? ' were' : ' was'
            } successfully transferred.`;
        } else {
            toastMessage = `Tab "${tab.name}" was removed and ${numTiles} tile${pluralTiles} deleted.`;
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
        pluralTiles,
        onMoveTile,
        destinationTabId,
    ]);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Remove tab"
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
                        ? 'Transfer'
                        : 'Delete tiles'}
                </Button>
            }
        >
            <Stack gap="md">
                <Text>
                    What would you like to do with the tiles in this tab before
                    removing it?
                </Text>
                <Radio.Group
                    value={removeAction}
                    onChange={(val: string) => setRemoveAction(val)}
                >
                    <Stack gap="xs" mt={0}>
                        <Radio
                            label="Delete all tiles in this tab"
                            value={RemoveActions.DELETE}
                            styles={{
                                label: {
                                    paddingLeft: 'var(--mantine-spacing-xs)',
                                },
                            }}
                        />
                        <Radio
                            label="Transfer all tiles to another tab"
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
                                    placeholder="Pick a tab"
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
                        title="Warning: Scheduled deliveries affected"
                    >
                        <Stack gap="xs">
                            <Text size="sm">
                                This tab is currently used by{' '}
                                <Text fw={600} span>
                                    {affectedSchedulers.length}
                                </Text>{' '}
                                scheduled{' '}
                                {affectedSchedulers.length === 1
                                    ? 'delivery'
                                    : 'deliveries'}
                                :
                            </Text>
                            <List size="sm">
                                {affectedSchedulers.map((scheduler) => (
                                    <List.Item key={scheduler.schedulerUuid}>
                                        <Text size="sm">{scheduler.name}</Text>
                                    </List.Item>
                                ))}
                            </List>
                        </Stack>
                    </Callout>
                )}

                {removeAction === RemoveActions.DELETE && (
                    <>
                        <Text>
                            Are you sure you want to delete the tab{' '}
                            <b>"{tab.name}"</b> and its{' '}
                            <b>{tilesToRemove?.length}</b> tile{pluralTiles}?
                        </Text>
                        {newSavedCharts.length > 0 && (
                            <Stack gap="xs">
                                <Text>
                                    On save, this action will also permanently
                                    delete the following
                                    {newSavedCharts.length === 1
                                        ? ' chart that was '
                                        : ' charts that were '}
                                    created from within it:
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
