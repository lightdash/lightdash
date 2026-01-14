import { type Dashboard, type DashboardTab } from '@lightdash/common';
import { Button, Select, Text, type ModalProps } from '@mantine-8/core';
import { IconArrowAutofitContent } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import MantineModal from '../../common/MantineModal';

type Tile = Dashboard['tiles'][number];
type Props = Pick<ModalProps, 'opened' | 'onClose' | 'className'> & {
    tile: Tile;
    tabs?: DashboardTab[];
    onConfirm: (tile: Tile) => void;
};

const MoveTileToTabModal: FC<Props> = ({
    opened,
    onClose,
    tabs,
    tile,
    onConfirm,
    className,
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Move tile to another tab"
            icon={IconArrowAutofitContent}
            actions={
                <Button onClick={handleConfirm} disabled={!selectedTabId}>
                    Move
                </Button>
            }
            modalRootProps={{ className }}
        >
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
                    onChange={(value) => setSelectedTabId(value)}
                />
            ) : (
                <Text>No tabs available</Text>
            )}
        </MantineModal>
    );
};

export default MoveTileToTabModal;
