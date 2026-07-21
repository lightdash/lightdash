import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../common/Callout';
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
        onConfirm={onConfirm}
        confirmLabel="Change role"
        confirmLoading={loading}
    >
        <Callout variant="warning" title="This action cannot be undone">
            You are about to remove your own admin access. Another admin will
            need to restore it for you.
        </Callout>
    </MantineModal>
);

export default ConfirmAdminSelfDowngradeModal;
