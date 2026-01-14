import { type FC } from 'react';

import { type ServiceAccount } from '@lightdash/common';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    isDeleting: boolean;
    isOpen: boolean;
    onClose: () => void;
    onDelete: (uuid: string) => void;
    serviceAccount: ServiceAccount;
};

export const ServiceAccountsDeleteModal: FC<Props> = ({
    isDeleting,
    isOpen,
    onClose,
    onDelete,
    serviceAccount,
}) => {
    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title="Delete service account"
            variant="delete"
            resourceType="service account"
            resourceLabel={serviceAccount?.description}
            cancelDisabled={isDeleting}
            onConfirm={() => onDelete(serviceAccount?.uuid ?? '')}
            confirmLoading={isDeleting}
        />
    );
};
