import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../common/MantineModal';

type ConfirmAdminSelfDowngradeModalProps = {
    opened: boolean;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const ConfirmAdminSelfDowngradeModal: FC<
    ConfirmAdminSelfDowngradeModalProps
> = ({ opened, loading, onClose, onConfirm }) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        title="Change your organization role?"
        icon={IconAlertTriangle}
        role="alertdialog"
        size="md"
        description="You are about to remove your own admin access. This action cannot be undone — another admin will need to restore it for you."
        onConfirm={onConfirm}
        confirmLabel="Change role"
        confirmLoading={loading}
    />
);

export default ConfirmAdminSelfDowngradeModal;
