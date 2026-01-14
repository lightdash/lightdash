import { type OrganizationWarehouseCredentials } from '@lightdash/common';
import { type FC } from 'react';
import { useDeleteOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    warehouseCredentialsToBeDeleted: OrganizationWarehouseCredentials;
};

export const DeleteCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    warehouseCredentialsToBeDeleted,
}) => {
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationWarehouseCredentials();

    const handleConfirm = async () => {
        await mutateAsync(
            warehouseCredentialsToBeDeleted.organizationWarehouseCredentialsUuid,
        );
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete credentials"
            variant="delete"
            resourceType="credentials"
            resourceLabel={warehouseCredentialsToBeDeleted.name}
            cancelDisabled={isDeleting}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
        />
    );
};
