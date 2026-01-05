import { Button, type ModalProps } from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
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
        icon={IconAlertCircle}
        modalRootProps={{ className }}
        description={`Are you sure you want to delete the chart "${name}"?`}
        actions={
            <Button color="red" onClick={onConfirm}>
                Delete
            </Button>
        }
    >
        <Callout variant="warning" title="This change cannot be undone.">
            This chart was created from within the dashboard, so removing the
            tile will also result in the permanent deletion of the chart.
        </Callout>
    </MantineModal>
);

export default DeleteChartTileThatBelongsToDashboardModal;
