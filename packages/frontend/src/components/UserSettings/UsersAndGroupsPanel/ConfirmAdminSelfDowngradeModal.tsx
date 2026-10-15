import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../common/MantineModal';

type ConfirmAdminSelfDowngradeModalProps = {
    opened: boolean;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const ConfirmAdminSelfDowngradeModal: FC<
    ConfirmAdminSelfDowngradeModalProps
> = ({ opened, loading, onClose, onConfirm }) => {
    const { t } = useTranslation('userSettings');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t(
                'usersAndGroupsPanel.confirmAdminSelfDowngradeModal.title',
            )}
            icon={IconAlertTriangle}
            role="alertdialog"
            size="md"
            description={t(
                'usersAndGroupsPanel.confirmAdminSelfDowngradeModal.description',
            )}
            onConfirm={onConfirm}
            confirmLabel={t(
                'usersAndGroupsPanel.confirmAdminSelfDowngradeModal.confirm',
            )}
            confirmLoading={loading}
        />
    );
};

export default ConfirmAdminSelfDowngradeModal;
