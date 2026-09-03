import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';

type Props = {
    projectUuid: string;
    appUuid: string;
    chartName: string;
    onClose: () => void;
};

const ChartTypeUninstallModal: FC<Props> = ({
    projectUuid,
    appUuid,
    chartName,
    onClose,
}) => {
    const { health } = useApp();
    const queryClient = useQueryClient();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { mutateAsync: deleteApp, isLoading: isUninstalling } =
        useDeleteApp();

    const description = `${
        softDeleteEnabled
            ? `This chart type will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
            : 'This chart type and all of its versions will be permanently deleted, including any built artifacts in storage.'
    } Saved charts using this chart type will stop rendering until it is reinstalled. You can reinstall it from the library at any time.`;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Uninstall chart type"
            variant="delete"
            resourceType="chart type"
            resourceLabel={chartName}
            description={description}
            confirmLabel="Uninstall chart type"
            onConfirm={async () => {
                await deleteApp({
                    projectUuid,
                    appUuid,
                    successTitle: 'Chart type uninstalled',
                });
                // useDeleteApp already invalidates data-app-vizs; the library
                // catalog needs its own invalidation to flip back to Install.
                void queryClient.invalidateQueries({
                    queryKey: ['registry-chart-types', projectUuid],
                });
                onClose();
            }}
            confirmLoading={isUninstalling}
            cancelDisabled={isUninstalling}
        />
    );
};

export default ChartTypeUninstallModal;
