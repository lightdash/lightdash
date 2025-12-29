import { Button, Group, Modal, Stack, Text } from '@mantine-8/core';
import { useCallback, useState, type FC } from 'react';
import { useSchedulerReassignOwnerMutation } from '../../features/scheduler/hooks/useSchedulerReassignOwnerMutation';
import { UserSelect } from '../common/UserSelect';

type ReassignSchedulerOwnerModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    schedulerUuids: string[];
    excludedUserUuid?: string;
    onSuccess?: () => void;
};

const ReassignSchedulerOwnerModal: FC<ReassignSchedulerOwnerModalProps> = ({
    opened,
    onClose,
    projectUuid,
    schedulerUuids,
    excludedUserUuid,
    onSuccess,
}) => {
    const [selectedUserUuid, setSelectedUserUuid] = useState<string | null>(
        null,
    );

    const { mutate: reassignOwner, isLoading: isReassigning } =
        useSchedulerReassignOwnerMutation(projectUuid);

    const handleClose = useCallback(() => {
        setSelectedUserUuid(null);
        onClose();
    }, [onClose]);

    const handleConfirm = useCallback(() => {
        if (!selectedUserUuid) return;

        reassignOwner(
            {
                schedulerUuids,
                newOwnerUserUuid: selectedUserUuid,
            },
            {
                onSuccess: () => {
                    handleClose();
                    onSuccess?.();
                },
            },
        );
    }, [
        selectedUserUuid,
        reassignOwner,
        schedulerUuids,
        handleClose,
        onSuccess,
    ]);

    const schedulerCount = schedulerUuids.length;
    const schedulerText =
        schedulerCount === 1
            ? '1 scheduled delivery'
            : `${schedulerCount} scheduled deliveries`;

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={`Reassign owner for ${schedulerText}`}
            size="md"
        >
            <Stack gap="lg">
                <Text fz="sm" c="ldGray.7">
                    Select a new owner for the selected scheduled{' '}
                    {schedulerCount === 1 ? 'delivery' : 'deliveries'}. The new
                    owner will be responsible for managing{' '}
                    {schedulerCount === 1 ? 'it' : 'them'}.
                </Text>

                <UserSelect
                    label="New owner"
                    value={selectedUserUuid}
                    onChange={setSelectedUserUuid}
                    excludedUserUuid={excludedUserUuid}
                />

                <Group justify="flex-end" gap="sm">
                    <Button variant="default" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        loading={isReassigning}
                        disabled={!selectedUserUuid}
                    >
                        Reassign
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default ReassignSchedulerOwnerModal;
