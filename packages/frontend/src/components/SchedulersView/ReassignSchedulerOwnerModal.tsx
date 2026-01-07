import { Button, Group, Stack, Text } from '@mantine-8/core';
import { IconInfoCircle, IconUserCheck } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useSchedulerReassignOwnerMutation } from '../../features/scheduler/hooks/useSchedulerReassignOwnerMutation';
import MantineIcon from '../common/MantineIcon';
import MantineModal, { type MantineModalProps } from '../common/MantineModal';
import { UserSelect } from '../common/UserSelect';

type ReassignSchedulerOwnerModalProps = Pick<
    MantineModalProps,
    'opened' | 'onClose'
> & {
    projectUuid: string;
    schedulerUuids: string[];
    excludedUserUuid?: string;
    onSuccess?: () => void;
    /** When true, only shows users with an active Google connection */
    hasGsheetsSchedulers?: boolean;
};

const ReassignSchedulerOwnerModal: FC<ReassignSchedulerOwnerModalProps> = ({
    opened,
    onClose,
    projectUuid,
    schedulerUuids,
    excludedUserUuid,
    onSuccess,
    hasGsheetsSchedulers = false,
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
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={`Reassign owner for "${schedulerText}"`}
            icon={IconUserCheck}
            size="lg"
            actions={
                <Button
                    onClick={handleConfirm}
                    loading={isReassigning}
                    disabled={!selectedUserUuid}
                >
                    Reassign
                </Button>
            }
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
                    requireGoogleToken={hasGsheetsSchedulers}
                />

                {hasGsheetsSchedulers && (
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="ldGray.6"
                            size="lg"
                        />
                        <Text fz="xs" c="dimmed">
                            You can only transfer ownership of a Google Sheets
                            sync to a user with an active Google connection.
                        </Text>
                    </Group>
                )}
            </Stack>
        </MantineModal>
    );
};

export default ReassignSchedulerOwnerModal;
