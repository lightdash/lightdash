import { Button, Text, TextInput, type ModalProps } from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
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
            icon={IconAlertCircle}
            size="md"
            actions={
                <Button
                    color="red"
                    disabled={
                        confirmOrgName?.toLowerCase() !==
                        organization.name.toLowerCase()
                    }
                    loading={isDeleting}
                    onClick={() => handleConfirm()}
                >
                    Delete
                </Button>
            }
        >
            <Text>
                Type the name of this organization{' '}
                <b>{organization.name}</b> to confirm you want to delete
                this organization and its users. This action is not
                reversible.
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
