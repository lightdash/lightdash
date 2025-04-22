import {
    Alert,
    Box,
    Button,
    Group,
    Paper,
    ScrollArea,
    Text,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import MantineModal, { type MantineModalProps } from '../MantineModal';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';

type Props<T, U> = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    items: T;
    spaces: U;
    onConfirm: (spaceUuid: string) => void;
};

const TransferItemsModal = <
    T extends Array<unknown>,
    U extends Array<NestableItem>,
>({
    opened,
    onClose,
    items,
    spaces,
    onConfirm,
}: Props<T, U>) => {
    const [spaceUuid, setSpaceUuid] = useState<string | null>(null);

    const selectedSpaceLabel = useMemo(() => {
        if (!spaceUuid) return null;
        return spaces.find((space) => space.uuid === spaceUuid)?.name;
    }, [spaceUuid, spaces]);

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
                Select a space to transfer {items.length > 1 ? 'items' : 'item'}{' '}
                to:
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
                    data={spaces}
                    value={spaceUuid}
                    onChange={setSpaceUuid}
                    topLevelLabel="Spaces"
                />
            </Paper>

            {selectedSpaceLabel ? (
                <Alert color="gray">
                    <Text fw={500}>
                        Transfer {items.length}{' '}
                        {items.length > 1 ? 'items' : 'item'} to{' '}
                        {selectedSpaceLabel}.
                    </Text>
                </Alert>
            ) : null}
        </MantineModal>
    );
};

export default TransferItemsModal;
