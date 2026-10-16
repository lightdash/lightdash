import {
    Anchor,
    List,
    ScrollArea,
    Stack,
    type ModalProps,
} from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import DocumentsLinkingChartCallout from '../../../features/documents/DocumentsLinkingChartCallout';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import { useProjectUrlIdentifier } from '../../../hooks/useProjectRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
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
    const { t } = useTranslation('modals');
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { data: chart, isInitialLoading } = useSavedQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });
    const {
        data: relatedDashboards,
        isInitialLoading: isLoadingRelatedDashboards,
    } = useDashboardsContainingChart(projectUuid, uuid);
    const { mutateAsync: deleteChart, isLoading: isDeleting } =
        useSavedQueryDeleteMutation(projectUuid);

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
        ? t('chartDelete.softDeleteDescription', { count: retentionDays })
        : undefined;

    const dashboardWarningTitle = softDeleteEnabled
        ? t('chartDelete.dashboardWarningSoft', {
              count: relatedDashboards.length,
          })
        : t('chartDelete.dashboardWarningPermanent', {
              count: relatedDashboards.length,
          });

    return (
        <MantineModal
            opened={modalProps.opened}
            onClose={modalProps.onClose}
            title={t('chartDelete.title')}
            variant="delete"
            resourceType={t('resourceTypes.chart')}
            resourceLabel={chart.name}
            description={description}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
            cancelDisabled={isDeleting}
        >
            <Stack gap="sm">
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
                                            to={`/projects/${projectUrlIdentifier}/dashboards/${dashboard.slug}`}
                                        >
                                            {dashboard.name}
                                        </Anchor>
                                    </List.Item>
                                ))}
                            </List>
                        </ScrollArea.Autosize>
                    </Callout>
                )}
                <DocumentsLinkingChartCallout
                    projectUuid={projectUuid}
                    kind="chart"
                    chartUuid={uuid}
                    softDeleteEnabled={!!softDeleteEnabled}
                />
            </Stack>
        </MantineModal>
    );
};

export default ChartDeleteModal;
