import { Anchor, List, ScrollArea, type ModalProps } from '@mantine-8/core';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import {
    useSavedQuery,
    useSavedQueryDeleteMutation,
} from '../../../hooks/useSavedQuery';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import MantineModal from '../MantineModal';

interface ChartDeleteModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

const ChartDeleteModal: FC<ChartDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete?.enabled;
    const retentionDays = health.data?.softDelete?.retentionDays;

    const { data: chart, isInitialLoading } = useSavedQuery({ id: uuid });
    const {
        data: relatedDashboards,
        isInitialLoading: isLoadingRelatedDashboards,
    } = useDashboardsContainingChart(projectUuid, uuid);
    const { mutateAsync: deleteChart, isLoading: isDeleting } =
        useSavedQueryDeleteMutation();

    if (
        isInitialLoading ||
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

    const description = softDeleteEnabled
        ? `This chart will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : undefined;

    const dashboardWarningTitle = softDeleteEnabled
        ? `This chart tile will be removed from ${relatedDashboards.length} dashboard${relatedDashboards.length > 1 ? 's' : ''}. The chart can be restored from Recently deleted.`
        : `This action will permanently remove a chart tile from ${relatedDashboards.length} dashboard${relatedDashboards.length > 1 ? 's' : ''}:`;

    return (
        <MantineModal
            opened={modalProps.opened}
            onClose={modalProps.onClose}
            title="Delete Chart"
            variant="delete"
            resourceType="chart"
            resourceLabel={chart.name}
            description={description}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
        >
            {relatedDashboards.length > 0 && (
                <Callout
                    variant={softDeleteEnabled ? 'warning' : 'danger'}
                    title={dashboardWarningTitle}
                >
                    <ScrollArea.Autosize mah="200px">
                        <List>
                            {relatedDashboards.map((dashboard) => (
                                <List.Item key={dashboard.uuid}>
                                    <Anchor
                                        component={Link}
                                        fz="sm"
                                        target="_blank"
                                        to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                    >
                                        {dashboard.name}
                                    </Anchor>
                                </List.Item>
                            ))}
                        </List>
                    </ScrollArea.Autosize>
                </Callout>
            )}
        </MantineModal>
    );
};

export default ChartDeleteModal;
