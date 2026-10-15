import { type ModalProps } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';

type UnsavedChangesModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    onDiscard: () => void;
};

const UnsavedChangesModal: FC<UnsavedChangesModalProps> = ({
    opened,
    onClose,
    onDiscard,
}) => {
    const { t } = useTranslation('sourceCode');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            role="alertdialog"
            title={t('unsavedChanges.title')}
            icon={IconAlertTriangle}
            description={t('unsavedChanges.description')}
            onConfirm={onDiscard}
            confirmLabel={t('unsavedChanges.discard')}
        />
    );
};

export default UnsavedChangesModal;
