import { getAppDisplayName, type DataAppViz } from '@lightdash/common';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';

type Props = {
    projectUuid: string;
    dataAppViz: DataAppViz;
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

    const { mutateAsync: deleteApp, isLoading: isDeleting } = useDeleteApp();

    const description = softDeleteEnabled
        ? `This chart type will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : 'This chart type and all of its versions will be permanently deleted, including any built artifacts in storage.';

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Delete chart type"
            variant="delete"
            resourceType="chart type"
            resourceLabel={getAppDisplayName(
                dataAppViz.name,
                dataAppViz.dataAppVizUuid,
            )}
            description={description}
            onConfirm={async () => {
                await deleteApp({
                    projectUuid,
                    appUuid: dataAppViz.dataAppVizUuid,
                    successTitle: 'Chart type deleted',
                });
                onDeleted();
            }}
            confirmLoading={isDeleting}
            cancelDisabled={isDeleting}
        />
    );
};

export default ChartTypeDeleteModal;
