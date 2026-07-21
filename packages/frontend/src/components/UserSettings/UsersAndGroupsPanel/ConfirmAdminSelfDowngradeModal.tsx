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
        title="Downgrade your role?"
        icon={IconAlertTriangle}
        role="alertdialog"
        size="md"
        description="You cannot undo this action. Another admin will have to manage your role for you."
        onConfirm={onConfirm}
        confirmLabel="Downgrade role"
        confirmLoading={loading}
    />
);

export default ConfirmAdminSelfDowngradeModal;
