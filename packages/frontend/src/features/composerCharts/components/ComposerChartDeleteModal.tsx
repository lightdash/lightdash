import { ContentType } from '@lightdash/common';
import {
    Anchor,
    List,
    ScrollArea,
    Stack,
    type ModalProps,
} from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';
import { useContentAction } from '../../../hooks/useContent';
import useApp from '../../../providers/App/useApp';
import { useComposerChartDashboards } from '../hooks/useComposerChartDashboards';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    composerChartUuid: string;
    name: string;
    onConfirm?: () => void;
};

export const ComposerChartDeleteModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    composerChartUuid,
    name,
    onConfirm,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const retentionDays = health.data?.softDelete.retentionDays;
    const dashboards = useComposerChartDashboards(
        projectUuid,
        composerChartUuid,
    );
    const { mutate: deleteChart, isLoading: isDeleting } = useContentAction(
        projectUuid,
        { onSuccess: onConfirm },
    );

    const count = dashboards.data?.length ?? 0;
    const plural = count > 1 ? 's' : '';
    const dashboardWarningTitle = softDeleteEnabled
        ? `Tiles on ${count} dashboard${plural} will show the chart as deleted. You can restore the chart from Recently deleted.`
        : `Tiles on ${count} dashboard${plural} will show the chart as deleted:`;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete Chart"
            variant="delete"
            resourceType="chart"
            resourceLabel={name}
            description={
                softDeleteEnabled
                    ? `This chart will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
                    : undefined
            }
            onConfirm={() =>
                deleteChart({
                    action: { type: 'delete' },
                    item: {
                        contentType: ContentType.COMPOSER_CHART,
                        uuid: composerChartUuid,
                    },
                })
            }
            confirmDisabled={dashboards.isInitialLoading}
            confirmLoading={isDeleting}
            cancelDisabled={isDeleting}
        >
            {count > 0 && (
                <Stack gap="sm">
                    <Callout
                        variant={softDeleteEnabled ? 'warning' : 'danger'}
                        title={dashboardWarningTitle}
                    >
                        <ScrollArea.Autosize mah="200px">
                            <List>
                                {dashboards.data?.map((dashboard) => (
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
                </Stack>
            )}
        </MantineModal>
    );
};
