import { Stack, Text, TextInput, type ModalProps } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useLeaveOrganizationMutation } from '../../../hooks/user/useLeaveOrganizationMutation';
import MantineModal from '../../common/MantineModal';

export const LeaveOrganizationModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'>
> = ({ opened, onClose }) => {
    const { isInitialLoading, data: organization } = useOrganization();
    const { mutateAsync, isLoading: isLeaving } =
        useLeaveOrganizationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isInitialLoading || !organization) return null;

    const handleConfirm = async () => {
        await mutateAsync();
        onClose();
    };

    const handleOnClose = () => {
        setConfirmOrgName(undefined);
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleOnClose}
            title="Leave organization"
            variant="delete"
            confirmLabel="Leave"
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmOrgName?.toLowerCase() !==
                organization.name.toLowerCase()
            }
            confirmLoading={isLeaving}
        >
            <Stack gap="sm">
                <Text fz="sm" c="dimmed">
                    Type the name of this organization to confirm. You will lose
                    access to all of its projects and will be signed out.
                </Text>

                <TextInput
                    name="confirmOrgName"
                    placeholder={organization.name}
                    value={confirmOrgName ?? ''}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />
            </Stack>
        </MantineModal>
    );
};
