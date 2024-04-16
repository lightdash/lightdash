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
import { useState, type FC } from 'react';

type AddProps = ModalProps & {
    tab: DashboardTab | undefined;
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
    const [_, setErrorMessage] = useState<string>();

    const handleClose = () => {
        setErrorMessage('');
        onClose?.();
    };

    const handleSubmit = (uuid: string) => {
        handleClose();
        handleDeleteTab(uuid);
    };

    const getNumberOfTiles = (uuid: string | undefined) => {
        const numberOfTiles = dashboardTiles?.filter(
            (tile) => tile.tabUuid == uuid,
        )?.length;
        return numberOfTiles ? numberOfTiles : 0;
    };

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
                    Are you sure you want to delete tab {tab?.name}?
                    <br />
                    This action will permanently delete{' '}
                    {getNumberOfTiles(tab?.uuid)} tiles once you save your
                    dashboard changes.
                </Text>
                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        color="red"
                        onClick={() => handleSubmit(tab?.uuid ? tab.uuid : '')}
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
