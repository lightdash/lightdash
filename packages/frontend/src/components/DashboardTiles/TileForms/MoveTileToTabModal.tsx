import { type Dashboard, type DashboardTab } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Select,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconArrowAutofitContent } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';

import MantineIcon from '../../common/MantineIcon';

type Tile = Dashboard['tiles'][number];
type Props = ModalProps & {
    tile: Tile;
    tabs?: DashboardTab[];
    onConfirm: (tile: Tile) => void;
};

const MoveTileToTabModal: FC<Props> = ({
    tabs,
    tile,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

    const handleConfirm = useCallback(() => {
        if (selectedTabId) {
            onConfirm({
                ...tile,
                x: 0,
                y: 0,
                tabUuid: selectedTabId,
            });
        }
    }, [onConfirm, selectedTabId, tile]);
    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon
                        size="lg"
                        color="blue.8"
                        icon={IconArrowAutofitContent}
                    />
                    <Title order={4}>Move tile to another tab</Title>
                </Group>
            }
            {...modalProps}
            onClose={onClose}
        >
            <Stack spacing="lg" pt="sm">
                {tabs && tabs.length ? (
                    <Select
                        label="Select tab to move this tile to"
                        value={selectedTabId}
                        placeholder="Pick a tab"
                        data={tabs
                            .filter((tab) => tab.uuid !== tile.tabUuid)
                            .map((tab) => ({
                                value: tab.uuid,
                                label: tab.name,
                            }))}
                        withinPortal
                        onChange={(value) => setSelectedTabId(value)}
                    />
                ) : (
                    <Text>No tabs available</Text>
                )}

                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Button onClick={handleConfirm} disabled={!selectedTabId}>
                        Move
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default MoveTileToTabModal;
