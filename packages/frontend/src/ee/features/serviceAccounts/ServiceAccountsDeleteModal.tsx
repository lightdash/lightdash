import { type ServiceAccount } from '@lightdash/common';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('serviceAccounts');
    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title={t('deleteModal.title')}
            variant="delete"
            resourceType={t('deleteModal.resourceType')}
            resourceLabel={serviceAccount?.description}
            cancelDisabled={isDeleting}
            onConfirm={() => onDelete(serviceAccount?.uuid ?? '')}
            confirmLoading={isDeleting}
        />
    );
};
