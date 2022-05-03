import { Button, Classes, Dialog } from '@blueprintjs/core';
import { DashboardBasicDetails } from 'common';
import { FC, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDeleteMutation as useDeleteDashboardMutation } from '../../../hooks/dashboard/useDashboard';
import { getDashboards } from '../../../hooks/dashboard/useDashboards';
import { useDeleteMutation } from '../../../hooks/useSavedQuery';

interface DeleteActionModalProps {
    name: string;
    uuid: string;
    isOpen: boolean;
    isChart: boolean;
    onClose: () => void;
}

const DeleteActionModal: FC<DeleteActionModalProps> = ({
    name,
    uuid,
    isOpen,
    onClose,
    isChart,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { mutate: deleteDashboard, isLoading: isDeleting } =
        useDeleteDashboardMutation();

    const { mutate: deleteChart, isLoading } = useDeleteMutation();
    const [relatedDashboards, setRelatedDashboards] = useState<
        DashboardBasicDetails[]
    >([]);

    useEffect(() => {
        if (isChart) {
            getDashboards(projectUuid, uuid).then((dashboards) => {
                setRelatedDashboards(dashboards);
            });
        }
    }, [isChart, uuid, projectUuid]);

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
                {relatedDashboards && relatedDashboards.length > 0 && (
                    <>
                        <b>
                            This action will remove a chart tile from{' '}
                            {relatedDashboards.length} dashboard
                            {relatedDashboards.length > 1 ? 's' : ''}:
                        </b>
                        <ul>
                            {relatedDashboards.map((dashboard) => {
                                return (
                                    <li>
                                        <Link
                                            target="_blank"
                                            to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                        >
                                            {dashboard.name}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
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
