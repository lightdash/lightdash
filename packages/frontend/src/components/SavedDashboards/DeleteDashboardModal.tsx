import { Button, Classes, Dialog } from '@blueprintjs/core';
import { FC } from 'react';
import { useDeleteMutation } from '../../hooks/dashboard/useDashboard';

interface DeleteDashboardModalProps {
    uuid: string;
    name: string;
    isOpen: boolean;
    onClose: () => void;
}

export const DeleteDashboardModal: FC<DeleteDashboardModalProps> = ({
    uuid,
    name,
    isOpen,
    onClose,
}) => {
    const { mutate: deleteData, isLoading: isDeleting } = useDeleteMutation();

    return (
        <Dialog
            isOpen={isOpen}
            icon="delete"
            onClose={onClose}
            title={'Delete dashboard'}
        >
            <div className={Classes.DIALOG_BODY}>
                <p>
                    Are you sure you want to delete the dashboard{' '}
                    <b>"{name}"</b> ?
                </p>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button disabled={isDeleting} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={isDeleting}
                        intent="danger"
                        onClick={() => {
                            deleteData(uuid);
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
