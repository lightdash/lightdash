import { TextInput, type ModalProps } from '@mantine/core';
import { useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useDeleteOrganizationMutation } from '../../../hooks/organization/useOrganizationDeleteMultation';
import MantineModal from '../../common/MantineModal';

export const OrganizationDeleteModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'>
> = ({ opened, onClose }) => {
    const { isInitialLoading, data: organization } = useOrganization();
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState('');

    if (isInitialLoading || !organization) return null;

    const organizationName = organization.name.trim();
    const confirmationText = organizationName || 'DELETE';

    const handleConfirm = async () => {
        await mutateAsync(organization.organizationUuid);
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
            title={`Delete “${organizationName || 'Unnamed organization'}”?`}
            variant="delete"
            confirmLabel="Permanently delete organization"
            description="This permanently removes all projects, saved content, users, and service accounts in this organization. You will be signed out. This cannot be undone."
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmOrgName.toLowerCase() !== confirmationText.toLowerCase()
            }
            confirmLoading={isDeleting}
        >
            <TextInput
                name="confirmOrgName"
                label={`Type ${confirmationText} to confirm`}
                description={
                    organizationName
                        ? undefined
                        : 'This organization has no name, so use DELETE instead.'
                }
                placeholder={confirmationText}
                value={confirmOrgName}
                onChange={(e) => setConfirmOrgName(e.target.value)}
            />
        </MantineModal>
    );
};
