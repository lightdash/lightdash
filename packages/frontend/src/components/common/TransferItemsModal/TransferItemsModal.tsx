import { type SpaceSummary } from '@lightdash/common';
import { Alert, Box, Button, Group, LoadingOverlay, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import MantineIcon from '../MantineIcon';
import MantineModal, { type MantineModalProps } from '../MantineModal';
import SpaceCreationForm from '../SpaceSelector/SpaceCreationForm';
import SpaceSelector from '../SpaceSelector/SpaceSelector';
import { type NestableItem } from '../Tree/types';

type Props<T, U> = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    items: T;
    spaces: U;
    isLoading: boolean;
    onConfirm: (spaceUuid: string) => void;
};

const TransferItemsModal = <
    T extends Array<unknown>,
    U extends Array<NestableItem & Pick<SpaceSummary, 'isPrivate' | 'access'>>,
>({
    projectUuid,
    opened,
    onClose,
    items,
    spaces,
    onConfirm,
    isLoading,
}: Props<T, U>) => {
    const {
        selectedSpaceUuid,
        setSelectedSpaceUuid,
        isCreatingNewSpace,
        newSpaceName,
        setNewSpaceName,
        createSpaceMutation,
        handleCreateNewSpace,
        openCreateSpaceForm,
        closeCreateSpaceForm,
    } = useSpaceManagement({ projectUuid });

    const selectedSpaceLabel = useMemo(() => {
        if (!selectedSpaceUuid) return '';
        return (
            spaces.find((space) => space.uuid === selectedSpaceUuid)?.name || ''
        );
    }, [selectedSpaceUuid, spaces]);

    const handleConfirm = useCallback(() => {
        if (selectedSpaceUuid) {
            onConfirm(selectedSpaceUuid);
        }
    }, [selectedSpaceUuid, onConfirm]);

    const createSpace = useCallback(async () => {
        try {
            const result = await handleCreateNewSpace();
            if (result?.uuid) {
                onConfirm(result.uuid);
            }
        } catch (error) {
            console.error('Failed to create space:', error);
        }
    }, [handleCreateNewSpace, onConfirm]);

    return (
        <MantineModal
            title={`Transfer ${items.length > 1 ? 'items' : 'item'}`}
            opened={opened}
            onClose={onClose}
            actions={
                <>
                    {!isCreatingNewSpace ? (
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={openCreateSpaceForm}
                            leftIcon={<MantineIcon icon={IconPlus} />}
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

                        {isCreatingNewSpace ? (
                            <Button
                                loading={createSpaceMutation.isLoading}
                                disabled={newSpaceName.length === 0}
                                onClick={createSpace}
                            >
                                Create space & transfer
                            </Button>
                        ) : (
                            <Button
                                disabled={!selectedSpaceUuid}
                                onClick={handleConfirm}
                            >
                                Confirm
                            </Button>
                        )}
                    </Group>
                </>
            }
        >
            <LoadingOverlay
                visible={createSpaceMutation.isLoading || isLoading}
            />
            {isCreatingNewSpace ? (
                <SpaceCreationForm
                    spaceName={newSpaceName}
                    onSpaceNameChange={setNewSpaceName}
                    onCancel={closeCreateSpaceForm}
                    isLoading={createSpaceMutation.isLoading}
                    parentSpaceName={selectedSpaceLabel}
                />
            ) : (
                <>
                    <Text fz="sm" fw={500}>
                        Select a space to transfer{' '}
                        {items.length > 1 ? 'items' : 'item'} to:
                    </Text>

                    <SpaceSelector
                        projectUuid={projectUuid}
                        spaces={spaces}
                        selectedSpaceUuid={selectedSpaceUuid}
                        onSelectSpace={setSelectedSpaceUuid}
                        isLoading={createSpaceMutation.isLoading}
                        scrollingContainerProps={{
                            // this is a hack that prevents the modal from jumping when the Alert is shown or hidden.
                            // PX value is based on the height of the Alert component below + spacing after the SpaceSelector.
                            h: selectedSpaceLabel ? '350px' : '412px',
                        }}
                    />
                </>
            )}

            {!isCreatingNewSpace && selectedSpaceLabel ? (
                <Alert color="gray">
                    <Text fw={500}>
                        Transfer {items.length}{' '}
                        {items.length > 1 ? 'items' : 'item'}{' '}
                        {!isCreatingNewSpace ? `"${selectedSpaceLabel}"` : ''} .
                    </Text>
                </Alert>
            ) : null}
        </MantineModal>
    );
};

export default TransferItemsModal;
