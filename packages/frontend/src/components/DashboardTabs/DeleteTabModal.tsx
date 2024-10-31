import {
    isChartTile,
    type DashboardChartTile,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    Button,
    Group,
    List,
    Modal,
    Radio,
    Select,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';

type AddProps = ModalProps & {
    tab: DashboardTab;
    dashboardTiles: DashboardTile[] | undefined;
    dashboardTabs: DashboardTab[] | undefined;
    onDeleteTab: (tabUuid: string) => void;
    onMoveTile: (tile: DashboardTile) => void;
};

enum RemoveActions {
    MOVE = 'move',
    DELETE = 'delete',
}

export const TabDeleteModal: FC<AddProps> = ({
    tab,
    dashboardTiles,
    dashboardTabs,
    onClose: handleClose,
    onDeleteTab: handleDeleteTab,
    onMoveTile: handleMoveTile,
    ...modalProps
}) => {
    const [removeAction, setRemoveAction] = useState(RemoveActions.MOVE);
    const [destinationTabId, setDestinationTabId] = useState<
        string | undefined
    >();

    const destinationTabs = useMemo(
        () =>
            dashboardTabs?.filter((otherTab) => otherTab.uuid !== tab.uuid) ||
            [],
        [dashboardTabs, tab.uuid],
    );

    useEffect(() => {
        if (modalProps.opened) {
            setRemoveAction(RemoveActions.MOVE);
            const destinationTab =
                destinationTabs.length === 1
                    ? destinationTabs[0].uuid
                    : undefined;
            setDestinationTabId(destinationTab);
        }
    }, [modalProps.opened, destinationTabs]);

    const { showToastSuccess } = useToaster();

    const isNewSavedChart = (tile: DashboardTile) => {
        return isChartTile(tile) && tile.properties.belongsToDashboard;
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
        handleClose();
        const numTiles = tilesToRemove.length || 0;
        let toastMessage = '';
        if (removeAction === RemoveActions.MOVE) {
            tilesToRemove.forEach((tile) => {
                handleMoveTile({
                    ...tile,
                    x: 0,
                    y: 0,
                    tabUuid: destinationTabId,
                });
            });
            toastMessage = `Tab "${tab.name}" was removed and ${numTiles} tile${
                pluralTiles ? 's were' : ' was'
            } successfully transferred.`;
        } else {
            toastMessage = `Tab "${tab.name}" was removed and ${numTiles} tile${pluralTiles} deleted.`;
        }
        handleDeleteTab(tab.uuid);
        showToastSuccess({ title: toastMessage });
    }, [
        handleClose,
        tilesToRemove,
        removeAction,
        handleDeleteTab,
        tab.uuid,
        tab.name,
        showToastSuccess,
        pluralTiles,
        handleMoveTile,
        destinationTabId,
    ]);

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} color="red" size="lg" />
                    <Title order={4}>Remove tab</Title>
                </Group>
            }
            {...modalProps}
            onClose={handleClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    What would you like to do with the tiles in this tab before
                    removing it?
                </Text>
                <Radio.Group
                    size="xs"
                    value={removeAction}
                    onChange={(val: RemoveActions) => setRemoveAction(val)}
                >
                    <Stack spacing="xs" mt={0}>
                        <Radio
                            label="Delete all tiles in this tab"
                            value={RemoveActions.DELETE}
                            styles={(theme) => ({
                                label: {
                                    paddingLeft: theme.spacing.xs,
                                },
                            })}
                        />
                        <Radio
                            label="Transfer all tiles to another tab"
                            value={RemoveActions.MOVE}
                            styles={(theme) => ({
                                label: {
                                    paddingLeft: theme.spacing.xs,
                                },
                            })}
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
                                    withinPortal
                                    styles={(theme) => ({
                                        root: {
                                            paddingLeft: theme.spacing.xl,
                                        },
                                    })}
                                />
                            )}
                    </Stack>
                </Radio.Group>

                {removeAction === RemoveActions.DELETE && (
                    <>
                        <Text>
                            Are you sure you want to delete the tab{' '}
                            <b>"{tab.name}"</b> and its{' '}
                            <b>{tilesToRemove?.length}</b> tile{pluralTiles}?
                        </Text>
                        {newSavedCharts.length > 0 && (
                            <Group spacing="xs">
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
                            </Group>
                        )}
                    </>
                )}

                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        color={
                            removeAction === RemoveActions.DELETE
                                ? 'red'
                                : 'unset'
                        }
                        disabled={
                            removeAction === RemoveActions.MOVE &&
                            !destinationTabId
                        }
                        onClick={handleSubmit}
                    >
                        {removeAction === RemoveActions.MOVE
                            ? 'Transfer'
                            : 'Delete tiles'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
