import { Button, Group, Stack, Text } from '@mantine/core';
import { IconInfoCircle, IconUserCheck } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('scheduler');
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

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('reassignOwnerModal.title', { count: schedulerCount })}
            icon={IconUserCheck}
            size="lg"
            actions={
                <Button
                    onClick={handleConfirm}
                    loading={isReassigning}
                    disabled={!selectedUserUuid}
                >
                    {t('reassignOwnerModal.reassign')}
                </Button>
            }
        >
            <Stack gap="lg">
                <Text fz="sm" c="ldGray.7">
                    {t('reassignOwnerModal.description', {
                        count: schedulerCount,
                    })}
                </Text>

                <UserSelect
                    projectUuid={projectUuid}
                    label={t('reassignOwnerModal.newOwner')}
                    value={selectedUserUuid}
                    onChange={setSelectedUserUuid}
                    excludedUserUuid={excludedUserUuid}
                    requireGoogleToken={hasGsheetsSchedulers}
                />

                {hasGsheetsSchedulers && (
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="dimmed"
                            size="lg"
                        />
                        <Text fz="xs" c="dimmed">
                            {t('reassignOwnerModal.gsheetsNote')}
                        </Text>
                    </Group>
                )}
            </Stack>
        </MantineModal>
    );
};

export default ReassignSchedulerOwnerModal;
