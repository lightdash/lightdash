import {
    Alert,
    Box,
    Button,
    Group,
    Paper,
    ScrollArea,
    Text,
    TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowLeft, IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCreateMutation } from '../../../hooks/useSpaces';
import MantineModal, { type MantineModalProps } from '../MantineModal';
import Tree from '../Tree/Tree';
import { type NestableItem } from '../Tree/types';

type Props<T, U> = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    items: T;
    spaces: U;
    onConfirm: (spaceUuid: string) => void;
};

const TransferItemsModal = <
    T extends Array<unknown>,
    U extends Array<NestableItem>,
>({
    projectUuid,
    opened,
    onClose,
    items,
    spaces,
    onConfirm,
}: Props<T, U>) => {
    const [spaceUuid, setSpaceUuid] = useState<string | null>(null);
    const [isCreateNewSpace, createNewSpaceHandlers] = useDisclosure(false);
    const [newSpaceName, setNewSpaceName] = useState('');

    const createSpaceMutation = useCreateMutation(projectUuid);

    const selectedSpaceLabel = useMemo(() => {
        if (!spaceUuid) return null;
        return spaces.find((space) => space.uuid === spaceUuid)?.name;
    }, [spaceUuid, spaces]);

    const handleCreateNewSpace = useCallback(() => {
        if (newSpaceName.length === 0) return;

        createSpaceMutation.mutate({
            name: newSpaceName,
            parentSpaceUuid: spaceUuid ?? undefined,
        });
    }, [createSpaceMutation, newSpaceName, spaceUuid]);

    useEffect(() => {
        if (createSpaceMutation.isSuccess) {
            onConfirm(createSpaceMutation.data.uuid);
        }
    }, [createSpaceMutation.isSuccess, createSpaceMutation.data, onConfirm]);

    return (
        <MantineModal
            title={`Transfer ${items.length > 1 ? 'items' : 'item'}`}
            opened={opened}
            onClose={onClose}
            actions={
                <>
                    {!isCreateNewSpace ? (
                        <Button
                            disabled={!spaceUuid}
                            variant="subtle"
                            leftIcon={<IconPlus size={14} />}
                            onClick={createNewSpaceHandlers.open}
                        >
                            New Space
                        </Button>
                    ) : null}

                    <Box sx={{ flexGrow: 1 }} />

                    <Group position="right">
                        <Button
                            variant="default"
                            onClick={onClose}
                            disabled={createSpaceMutation.isLoading}
                        >
                            Cancel
                        </Button>

                        {isCreateNewSpace ? (
                            <Button
                                loading={createSpaceMutation.isLoading}
                                disabled={newSpaceName.length === 0}
                                onClick={handleCreateNewSpace}
                            >
                                Create space & transfer
                            </Button>
                        ) : (
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
                        )}
                    </Group>
                </>
            }
        >
            {isCreateNewSpace ? (
                <>
                    <Box>
                        <Button
                            variant="subtle"
                            leftIcon={<IconArrowLeft size={14} />}
                            onClick={createNewSpaceHandlers.close}
                        >
                            Back
                        </Button>
                    </Box>

                    <Text fz="sm" fw={500}>
                        You are creating a new space in{' '}
                        <Text span fw={600}>
                            "{selectedSpaceLabel}"
                        </Text>
                    </Text>

                    <TextInput
                        label="Name"
                        placeholder="Space name"
                        required
                        disabled={createSpaceMutation.isLoading}
                        value={newSpaceName}
                        onChange={(e) => setNewSpaceName(e.target.value)}
                    />

                    <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                        <Text fw={500} color="blue">
                            Permissions will be inherited from{' '}
                            <Text span fw={600}>
                                '{selectedSpaceLabel}'
                            </Text>
                        </Text>
                    </Alert>
                </>
            ) : (
                <>
                    <Text fz="sm" fw={500}>
                        Select a space to transfer{' '}
                        {items.length > 1 ? 'items' : 'item'} to:
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
                                "{selectedSpaceLabel}".
                            </Text>
                        </Alert>
                    ) : null}
                </>
            )}
        </MantineModal>
    );
};

export default TransferItemsModal;
