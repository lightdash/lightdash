import { Text, TextInput, type ModalProps } from '@mantine-8/core';
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

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isInitialLoading || !organization) return null;

    const handleConfirm = async () => {
        await mutateAsync(organization.organizationUuid);
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
            title="Delete Organization"
            variant="delete"
            resourceType="organization"
            resourceLabel={organization.name}
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmOrgName?.toLowerCase() !==
                organization.name.toLowerCase()
            }
            confirmLoading={isDeleting}
        >
            <Text fz="sm" c="dimmed">
                Type the name of this organization to confirm. This action
                will delete all users and is not reversible.
            </Text>

            <TextInput
                name="confirmOrgName"
                placeholder={organization.name}
                value={confirmOrgName}
                onChange={(e) => setConfirmOrgName(e.target.value)}
            />
        </MantineModal>
    );
};
