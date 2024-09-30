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
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type AddProps = ModalProps & {
    tab: DashboardTab;
    dashboardTiles: DashboardTile[] | undefined;
    onDeleteTab: (tabUuid: string) => void;
};

export const TabDeleteModal: FC<AddProps> = ({
    tab,
    dashboardTiles,
    onClose,
    onDeleteTab: handleDeleteTab,
    ...modalProps
}) => {
    const handleClose = () => {
        onClose?.();
    };

    const handleSubmit = (uuid: string) => {
        handleClose();
        handleDeleteTab(uuid);
    };

    const isNewSavedChart = (tile: DashboardTile) => {
        return isChartTile(tile) && tile.properties.belongsToDashboard;
    };

    const tilesToDelete = useMemo(
        () => (dashboardTiles || []).filter((tile) => tile.tabUuid == tab.uuid),
        [tab.uuid, dashboardTiles],
    );

    const newSavedCharts = useMemo(
        () => tilesToDelete.filter(isNewSavedChart) as DashboardChartTile[],
        [tilesToDelete],
    );

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} color="red" size="lg" />
                    <Title order={4}>Remove tab</Title>
                </Group>
            }
            {...modalProps}
            size="xl"
            onClose={handleClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    Are you sure you want to remove tab <b>"{tab.name}"</b> and{' '}
                    <b>{tilesToDelete?.length}</b> tiles from this dashboard?
                    <br />
                    {newSavedCharts.length > 0 && (
                        <Text>
                            <br />
                            Once you save changes to your dashboard, this action
                            will also permanently delete the following charts
                            that were created from within it:
                        </Text>
                    )}
                </Text>
                <List>
                    {newSavedCharts.map((tile) => (
                        <List.Item key={tile.uuid}>
                            <Text>{tile.properties.chartName}</Text>
                        </List.Item>
                    ))}
                </List>
                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        color="red"
                        onClick={() => handleSubmit(tab.uuid)}
                    >
                        Remove
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
