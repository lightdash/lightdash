import { type DashboardTab, type DashboardTile } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useMemo, type FC } from 'react';

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

    const numberOfTiles = useMemo(() => {
        return (dashboardTiles || []).filter((tile) => tile.tabUuid == tab.uuid)
            ?.length;
    }, [tab.uuid, dashboardTiles]);

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <Title order={4}>Remove tab</Title>
                </Group>
            }
            {...modalProps}
            size="xl"
            onClose={handleClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    Are you sure you want to delete tab {tab.name}?
                    <br />
                    This action will permanently delete {numberOfTiles} tiles
                    once you save your dashboard changes.
                </Text>
                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        color="red"
                        onClick={() => handleSubmit(tab.uuid)}
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
