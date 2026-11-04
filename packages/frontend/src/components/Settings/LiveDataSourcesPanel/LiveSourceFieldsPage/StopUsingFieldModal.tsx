import { type LiveSourceField } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../common/MantineModal';
import { formatChartCount } from './liveSourceFieldsView';

type Props = {
    field: LiveSourceField;
    isStopping: boolean;
    onConfirm: () => void;
    onClose: () => void;
};

const StopUsingFieldModal: FC<Props> = ({
    field,
    isStopping,
    onConfirm,
    onClose,
}) => (
    <MantineModal
        opened
        onClose={onClose}
        variant="delete"
        role="alertdialog"
        title="Stop using field"
        confirmLabel="Stop using"
        confirmLoading={isStopping}
        onConfirm={onConfirm}
    >
        <Text fz="sm">
            Stop using <b>{field.label}</b>? Charts and AI agents can no longer
            query it. You can use it again from Available.
        </Text>
        {field.usedByChartCount > 0 && (
            <Text fz="sm" c="dimmed">
                Used by {formatChartCount(field.usedByChartCount)}, which will
                stop working until it's used again.
            </Text>
        )}
    </MantineModal>
);

export default StopUsingFieldModal;
