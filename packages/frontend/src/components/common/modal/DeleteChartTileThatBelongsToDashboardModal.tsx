import { type ModalProps } from '@mantine-8/core';
import { type FC } from 'react';
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
}) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        title="Delete chart"
        variant="delete"
        resourceType="chart"
        resourceLabel={name}
        modalRootProps={{ className }}
        onConfirm={onConfirm}
    >
        <Callout variant="warning" title="This change cannot be undone.">
            This chart was created from within the dashboard, so removing the
            tile will also result in the permanent deletion of the chart.
        </Callout>
    </MantineModal>
);

export default DeleteChartTileThatBelongsToDashboardModal;
