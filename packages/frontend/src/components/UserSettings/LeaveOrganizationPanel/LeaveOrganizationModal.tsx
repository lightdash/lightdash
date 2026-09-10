import { Stack, Text, TextInput, type ModalProps } from '@mantine/core';
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

    const [confirmOrgName, setConfirmOrgName] = useState('');

    if (isInitialLoading || !organization) return null;

    const organizationName = organization.name.trim();
    const confirmationText = organizationName || 'LEAVE';

    const handleConfirm = async () => {
        await mutateAsync();
        onClose();
    };

    const handleOnClose = () => {
        setConfirmOrgName('');
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleOnClose}
            title={`Leave “${organizationName || 'Unnamed organization'}”?`}
            variant="delete"
            confirmLabel="Leave"
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmOrgName.toLowerCase() !== confirmationText.toLowerCase()
            }
            confirmLoading={isLeaving}
        >
            <Stack gap="sm">
                <Text fz="sm" c="dimmed">
                    You will lose access to all projects in this organization
                    and will be signed out. The organization and its content
                    will remain available to other members.
                </Text>

                <TextInput
                    name="confirmOrgName"
                    label={`Type ${confirmationText} to confirm`}
                    placeholder={confirmationText}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />
            </Stack>
        </MantineModal>
    );
};
