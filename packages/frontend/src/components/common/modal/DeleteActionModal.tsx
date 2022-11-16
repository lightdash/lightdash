import { Button, Classes, Dialog } from '@blueprintjs/core';
import { FC } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import { useDeleteMutation as useDeleteDashboardMutation } from '../../../hooks/dashboard/useDashboard';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import { useDeleteMutation } from '../../../hooks/useSavedQuery';

interface RelatedDashboardsMessageProps {
    uuid: string;
}

const RelatedDashboardsMessage: FC<RelatedDashboardsMessageProps> = ({
    uuid,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: relatedDashboards } = useDashboardsContainingChart(
        projectUuid,
        uuid,
    );

    if (!relatedDashboards || relatedDashboards.length === 0) {
        return null;
    }

    return (
        <>
            <b>
                This action will remove a chart tile from{' '}
                {relatedDashboards.length} dashboard
                {relatedDashboards.length > 1 ? 's' : ''}:
            </b>
            <ul>
                {relatedDashboards.map((dashboard) => {
                    return (
                        <li key={dashboard.uuid}>
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
    );
};

interface DeleteActionModalProps {
    name: string;
    uuid: string;
    isOpen: boolean;
    isChart?: boolean;
    isExplorer?: boolean;
    onClose: () => void;
}

const DeleteActionModal: FC<DeleteActionModalProps> = ({
    name,
    uuid,
    isOpen,
    onClose,
    isChart,
    isExplorer,
}) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
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
                {isChart && <RelatedDashboardsMessage uuid={uuid} />}
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
                            if (isExplorer && isChart) {
                                history.listen((loc, action) => {
                                    if (action === 'POP') {
                                        if (loc.pathname.includes('/tables/')) {
                                            history.push(
                                                `/projects/${projectUuid}/tables`,
                                            );
                                        }
                                    }
                                });
                                if (uuid) {
                                    history.push('/');
                                }
                            }
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

DeleteActionModal.defaultProps = {
    isChart: false,
    isExplorer: false,
};

export default DeleteActionModal;
