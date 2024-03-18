import { Alert, Anchor, List, Text, type ModalProps } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import {
    useSavedQuery,
    useSavedQueryDeleteMutation,
} from '../../../hooks/useSavedQuery';
import MantineIcon from '../MantineIcon';
import CommonModal, { Intent } from './Modal';

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

    return (
        <CommonModal
            title="Delete Chart"
            intent={Intent.DELETE}
            onConfirm={handleConfirm}
            isLoading={isDeleting}
            {...modalProps}
        >
            <Text>
                Are you sure you want to delete the chart{' '}
                <Text span fw={600}>
                    "{chart.name}"
                </Text>
                ?
            </Text>

            {relatedDashboards.length > 0 && (
                <>
                    <Alert
                        icon={<MantineIcon icon={IconAlertCircle} />}
                        title={
                            <Text fw={600}>
                                This action will remove a chart tile from{' '}
                                {relatedDashboards.length} dashboard
                                {relatedDashboards.length > 1 ? 's' : ''}:
                            </Text>
                        }
                    >
                        <List fz="sm">
                            {relatedDashboards.map((dashboard) => (
                                <List.Item key={dashboard.uuid}>
                                    <Anchor
                                        component={Link}
                                        target="_blank"
                                        to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                    >
                                        {dashboard.name}
                                    </Anchor>
                                </List.Item>
                            ))}
                        </List>
                    </Alert>
                </>
            )}
        </CommonModal>
    );
};

export default ChartDeleteModal;
