import {
    getAppDisplayName,
    isOfficialChartType,
    type DataAppViz,
    type OrganizationDataAppViz,
} from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';
import { useDataAppVizDeleteImpact } from '../hooks/useDataAppVizDeleteImpact';
import { getChartTypeOwner } from '../utils/chartTypeOwner';

type Props = {
    projectUuid: string;
    dataAppViz: DataAppViz | OrganizationDataAppViz;
    onClose: () => void;
    onDeleted: () => void;
};

const ChartTypeDeleteModal: FC<Props> = ({
    projectUuid,
    dataAppViz,
    onClose,
    onDeleted,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const owner = getChartTypeOwner(dataAppViz);
    const { mutateAsync: deleteApp, isLoading: isDeleting } = useDeleteApp();
    const {
        data: impact,
        isFetching: isLoadingImpact,
        isError: isImpactError,
        refetch: refetchImpact,
    } = useDataAppVizDeleteImpact(
        projectUuid,
        dataAppViz.dataAppVizUuid,
        owner,
    );

    // Registry-official chart types are "uninstalled" (they can be
    // reinstalled from the library); the underlying operation is the same
    // app delete either way.
    const isOfficial = isOfficialChartType(dataAppViz);

    const displayName = getAppDisplayName(
        dataAppViz.name,
        dataAppViz.dataAppVizUuid,
    );
    const isOrganization = owner === 'organization';
    const canRestore = softDeleteEnabled && !isOrganization;

    const description = isOrganization
        ? `${displayName} will be removed from the organization library for every project. This can't be undone.`
        : softDeleteEnabled
          ? `The chart type moves to Recently deleted and is permanently removed after ${retentionDays} days.`
          : 'The chart type and all of its versions will be permanently deleted, including any built artifacts in storage. This cannot be undone.';

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={isOfficial ? 'Uninstall chart type' : 'Delete chart type'}
            subtitle={displayName}
            confirmLabel={isOfficial ? 'Uninstall' : undefined}
            variant="delete"
            resourceType="chart type"
            resourceLabel={displayName}
            description={description}
            onConfirm={async () => {
                await deleteApp({
                    projectUuid,
                    appUuid: dataAppViz.dataAppVizUuid,
                    owner,
                    successTitle: isOfficial
                        ? 'Chart type uninstalled'
                        : 'Chart type deleted',
                });
                onDeleted();
            }}
            confirmLoading={isDeleting}
            confirmDisabled={
                !health.data || isLoadingImpact || isImpactError || !impact
            }
            cancelDisabled={isDeleting}
        >
            {isLoadingImpact ? (
                <Text size="sm" c="dimmed" role="status">
                    Checking saved charts that use this chart type…
                </Text>
            ) : isImpactError ? (
                <Callout
                    variant="warning"
                    title="Could not check affected charts"
                >
                    <Stack gap="sm" align="flex-start">
                        <Text size="sm">
                            Try again to see the impact before continuing.
                        </Text>
                        <Button
                            variant="default"
                            size="xs"
                            onClick={() => void refetchImpact()}
                        >
                            Try again
                        </Button>
                    </Stack>
                </Callout>
            ) : impact?.chartCount === 0 ? (
                <Text size="sm">No saved charts use this chart type.</Text>
            ) : impact ? (
                <Callout
                    variant={canRestore ? 'warning' : 'danger'}
                    title={`${impact.chartCount} saved chart${impact.chartCount === 1 ? ' is' : 's are'} built on this chart type and will show an error.`}
                >
                    {isOrganization
                        ? 'The saved charts are kept, but will show an error wherever they appear, including on dashboards. Update the affected charts to use a different chart type to make them work again.'
                        : softDeleteEnabled
                          ? 'The saved charts are kept, but will show an error wherever they appear, including on dashboards, until the chart type is restored.'
                          : 'The saved charts are kept, but this chart type cannot be restored. Update the affected charts to use a different chart type to make them work again.'}
                </Callout>
            ) : null}
        </MantineModal>
    );
};

export default ChartTypeDeleteModal;
