import { type ModalProps } from '@mantine-8/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type UnsavedChangesModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    onDiscard: () => void;
};

const UnsavedChangesModal: FC<UnsavedChangesModalProps> = ({
    opened,
    onClose,
    onDiscard,
}) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        title="Unsaved changes"
        icon={IconAlertTriangle}
        description="You have unsaved changes. Are you sure you want to discard them?"
        onConfirm={onDiscard}
        confirmLabel="Discard changes"
    />
);

export default UnsavedChangesModal;
