import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
} from '@blueprintjs/core';
import { FC } from 'react';
import {
    useDashboardQuery,
    useDeleteMutation,
} from '../../../hooks/dashboard/useDashboard';

interface DashboardDeleteModalProps extends DialogProps {
    uuid: string;
    onConfirm?: () => void;
}

const DashboardDeleteModal: FC<DashboardDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { data: dashboard, isLoading } = useDashboardQuery(uuid);
    const { mutateAsync: deleteDashboard, isLoading: isDeleting } =
        useDeleteMutation();

    if (isLoading || !dashboard) {
        return null;
    }

    const handleConfirm = async () => {
        await deleteDashboard(uuid);
        onConfirm?.();
    };

    return (
        <Dialog lazy title="Delete Dashboard" icon="trash" {...modalProps}>
            <DialogBody>
                <p>
                    Are you sure you want to delete the dashboard{' '}
                    <b>"{dashboard.name}"</b>?
                </p>
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button onClick={modalProps.onClose}>Cancel</Button>

                        <Button
                            loading={isDeleting}
                            intent="danger"
                            onClick={handleConfirm}
                        >
                            Delete
                        </Button>
                    </>
                }
            />
        </Dialog>
    );
};

export default DashboardDeleteModal;
