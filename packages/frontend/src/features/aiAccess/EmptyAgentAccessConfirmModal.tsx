import MantineModal from '../../components/common/MantineModal';

export const EmptyAgentAccessConfirmModal = ({
    onCancel,
    onConfirm,
    saving,
}: {
    onCancel: () => void;
    onConfirm: () => void;
    saving: boolean;
}) => (
    <MantineModal
        opened
        role="alertdialog"
        title="No one's agents can run"
        description="No people are selected. If you save this list, no agent will run for anyone. Add people or choose Everyone the roles allow to allow agents again."
        onClose={() => {
            if (!saving) onCancel();
        }}
        onConfirm={onConfirm}
        confirmLoading={saving}
        confirmDisabled={saving}
        cancelDisabled={saving}
    />
);
