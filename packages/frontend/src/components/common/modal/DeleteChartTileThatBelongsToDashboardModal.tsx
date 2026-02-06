import { type ModalProps } from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import MantineModal from '../MantineModal';

interface Props extends ModalProps {
    name: string;
    onConfirm: () => void;
    className?: string;
}

const DeleteChartTileThatBelongsToDashboardModal: FC<Props> = ({
    opened,
    onClose,
    name,
    onConfirm,
    className,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const description = softDeleteEnabled
        ? `This chart will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : undefined;

    const calloutTitle = softDeleteEnabled
        ? 'This chart was created from within the dashboard.'
        : 'This change cannot be undone.';

    const calloutContent = softDeleteEnabled
        ? 'Removing the tile will also delete the chart. It can be restored from Recently deleted.'
        : 'This chart was created from within the dashboard, so removing the tile will also result in the permanent deletion of the chart.';

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete chart"
            variant="delete"
            resourceType="chart"
            resourceLabel={name}
            description={description}
            modalRootProps={{ className }}
            onConfirm={onConfirm}
        >
            <Callout
                variant={softDeleteEnabled ? 'warning' : 'danger'}
                title={calloutTitle}
            >
                {calloutContent}
            </Callout>
        </MantineModal>
    );
};

export default DeleteChartTileThatBelongsToDashboardModal;
