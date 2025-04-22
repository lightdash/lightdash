import {
    Alert,
    Box,
    Button,
    Group,
    Paper,
    ScrollArea,
    Text,
} from '@mantine/core';
import { useState } from 'react';
import MantineModal, { type MantineModalProps } from '../MantineModal';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';

type Props<T> = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    items: T[];
    onConfirm: (spaceUuid: string) => void;
};

const TransferItemsModal = <T extends NestableItem>({
    opened,
    onClose,
    items,
    onConfirm,
}: Props<T>) => {
    const [spaceUuid, setSpaceUuid] = useState<string | null>(null);

    return (
        <MantineModal
            title={`Transfer ${items.length > 1 ? 'items' : 'item'}`}
            opened={opened}
            onClose={onClose}
            actions={
                <Group position="apart" w="100%">
                    {/* <Button variant="subtle">New Space</Button> */}
                    <Box />

                    <Group>
                        <Button variant="default" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            disabled={!spaceUuid}
                            onClick={() => {
                                if (spaceUuid) {
                                    onConfirm(spaceUuid);
                                }
                            }}
                        >
                            Confirm
                        </Button>
                    </Group>
                </Group>
            }
        >
            <Text fz="sm" fw={500}>
                Select a space to transfer items to:
            </Text>

            <Paper
                component={ScrollArea}
                w="100%"
                h="320px"
                withBorder
                px="sm"
                py="xs"
            >
                <Tree
                    data={items}
                    value={spaceUuid}
                    onChange={setSpaceUuid}
                    topLevelLabel="Transfer items"
                />
            </Paper>

            <Alert color="gray">balala</Alert>
        </MantineModal>
    );
};

export default TransferItemsModal;
