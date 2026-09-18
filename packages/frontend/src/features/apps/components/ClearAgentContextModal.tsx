import { IconEraser } from '@tabler/icons-react';
import { type FC } from 'react';
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
}) => (
    <MantineModal
        opened={opened}
        onClose={() => {
            if (loading) return;
            onClose();
        }}
        title="Clear agent context?"
        icon={IconEraser}
        role="alertdialog"
        description="The agent will forget the current conversation and start fresh. Your app and files will not be changed."
        confirmLabel="Clear context"
        confirmLoading={loading}
        cancelDisabled={loading}
        onConfirm={onConfirm}
    />
);

export default ClearAgentContextModal;
