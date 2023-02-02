import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
} from '@blueprintjs/core';
import { FC } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import { useDeleteMutation, useSavedQuery } from '../../../hooks/useSavedQuery';

interface ChartDeleteModalProps extends DialogProps {
    uuid: string;
    onConfirm?: () => void;
}

const ChartDeleteModal: FC<ChartDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: chart, isLoading } = useSavedQuery({ id: uuid });
    const { data: relatedDashboards, isLoading: isLoadingRelatedDashboards } =
        useDashboardsContainingChart(projectUuid, uuid);
    const { mutateAsync: deleteChart, isLoading: isDeleting } =
        useDeleteMutation();

    if (
        isLoading ||
        isLoadingRelatedDashboards ||
        !chart ||
        !relatedDashboards
    ) {
        return null;
    }

    const handleConfirm = async () => {
        await deleteChart(uuid);
        onConfirm?.();
    };

    return (
        <Dialog lazy title="Delete Chart" icon="trash" {...modalProps}>
            <DialogBody>
                <p>
                    Are you sure you want to delete the chart{' '}
                    <b>"{chart.name}"</b>?
                </p>

                {relatedDashboards.length > 0 && (
                    <>
                        <b>
                            This action will remove a chart tile from{' '}
                            {relatedDashboards.length} dashboard
                            {relatedDashboards.length > 1 ? 's' : ''}:
                        </b>

                        <ul>
                            {relatedDashboards.map((dashboard) => (
                                <li key={dashboard.uuid}>
                                    <Link
                                        target="_blank"
                                        to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                    >
                                        {dashboard.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
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

export default ChartDeleteModal;
