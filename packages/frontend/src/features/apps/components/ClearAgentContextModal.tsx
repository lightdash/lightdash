import { IconEraser } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    opened: boolean;
    onClose: () => void;
    onConfirm: () => void;
    /** The clear request is in flight. */
    loading: boolean;
};

/** Confirms clearing the agent context; the caller owns the request. */
const ClearAgentContextModal: FC<Props> = ({
    opened,
    onClose,
    onConfirm,
    loading,
}) => {
    const { t } = useTranslation('apps');
    return (
        <MantineModal
            opened={opened}
            onClose={() => {
                if (loading) return;
                onClose();
            }}
            title={t('clearContext.modalTitle')}
            icon={IconEraser}
            role="alertdialog"
            description={t('clearContext.description')}
            confirmLabel={t('clearContext.confirm')}
            confirmLoading={loading}
            cancelDisabled={loading}
            onConfirm={onConfirm}
        />
    );
};

export default ClearAgentContextModal;
