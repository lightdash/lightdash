import { Button, Classes, Dialog } from '@blueprintjs/core';
import { FC } from 'react';
import { useDeleteMutation as useDeleteDashboardMutation } from '../../../hooks/dashboard/useDashboard';
import { useDeleteMutation } from '../../../hooks/useSavedQuery';

interface DeleteActionModalProps {
    uuid: string;
    name: string;
    isOpen: boolean;
    isChart: boolean;
    onClose: () => void;
}

const DeleteActionModal: FC<DeleteActionModalProps> = ({
    uuid,
    name,
    isOpen,
    onClose,
    isChart,
}) => {
    const { mutate: deleteDashboard, isLoading: isDeleting } =
        useDeleteDashboardMutation();
    const { mutate: deleteChart, isLoading } = useDeleteMutation();

    return (
        <Dialog
            isOpen={isOpen}
            icon="delete"
            onClose={onClose}
            title={`Delete ${isChart ? 'chart' : 'dashboard'}`}
        >
            <div className={Classes.DIALOG_BODY}>
                <p>
                    {`Are you sure you want to delete the ${
                        isChart ? 'chart' : 'dashboard'
                    } `}
                    <b>"{name}"</b> ?
                </p>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button
                        disabled={isDeleting || isLoading}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        disabled={isDeleting || isLoading}
                        intent="danger"
                        onClick={() => {
                            if (isChart) deleteChart(uuid);
                            if (!isChart) deleteDashboard(uuid);
                            onClose();
                        }}
                    >
                        Delete
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default DeleteActionModal;
