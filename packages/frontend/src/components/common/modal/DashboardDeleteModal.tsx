import { hasChartsInDashboard, isChartTile } from '@lightdash/common';
import {
    Button,
    Group,
    List,
    Modal,
    ModalProps,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import {
    useDashboardDeleteMutation,
    useDashboardQuery,
} from '../../../hooks/dashboard/useDashboard';
import MantineIcon from '../MantineIcon';

interface DashboardDeleteModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

const DashboardDeleteModal: FC<DashboardDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { data: dashboard, isInitialLoading } = useDashboardQuery(uuid);
    const { mutateAsync: deleteDashboard, isLoading: isDeleting } =
        useDashboardDeleteMutation();

    if (isInitialLoading || !dashboard) {
        return null;
    }

    const handleConfirm = async () => {
        await deleteDashboard(uuid);
        onConfirm?.();
    };

    const chartsInDashboardTiles = dashboard.tiles.filter(
        (tile) => isChartTile(tile) && tile.properties.belongsToDashboard,
    );

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} color="red" size="lg" />
                    <Title order={4}>Delete dashboard</Title>
                </Group>
            }
            {...modalProps}
        >
            <Stack>
                {hasChartsInDashboard(dashboard) ? (
                    <Stack>
                        <Text>
                            Are you sure you want to delete the dashboard{' '}
                            <b>"{dashboard.name}"</b>?
                        </Text>
                        <Text>
                            This action will also permanently delete the
                            following charts that were created from within it:
                        </Text>
                        <List size="sm">
                            {chartsInDashboardTiles.map(
                                (tile) =>
                                    isChartTile(tile) && (
                                        <List.Item key={tile.uuid}>
                                            <Text>
                                                {tile.properties.chartName}
                                            </Text>
                                        </List.Item>
                                    ),
                            )}
                        </List>
                    </Stack>
                ) : (
                    <Text>
                        Are you sure you want to delete the dashboard{' '}
                        <b>"{dashboard.name}"</b>?
                    </Text>
                )}

                <Group position="right" spacing="xs">
                    <Button
                        color="dark"
                        variant="outline"
                        onClick={modalProps.onClose}
                    >
                        Cancel
                    </Button>

                    <Button
                        color="red"
                        loading={isDeleting}
                        onClick={handleConfirm}
                        type="submit"
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default DashboardDeleteModal;
