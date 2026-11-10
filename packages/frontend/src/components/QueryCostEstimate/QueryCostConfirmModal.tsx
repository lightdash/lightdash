import { formatEstimatedBytes } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../common/Callout';
import MantineModal from '../common/MantineModal';

type Props = {
    opened: boolean;
    totalBytesProcessed: number;
    confirmEstimatedBytesAbove: number;
    onConfirm: () => void;
    onClose: () => void;
};

export const QueryCostConfirmModal: FC<Props> = ({
    opened,
    totalBytesProcessed,
    confirmEstimatedBytesAbove,
    onConfirm,
    onClose,
}) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        title="Run a large query?"
        icon={IconDatabase}
        role="alertdialog"
        confirmLabel="Run query"
        onConfirm={onConfirm}
    >
        <Text fz="sm">
            A dry run estimates this query will process{' '}
            <Text span fw={600} fz="sm">
                {formatEstimatedBytes(totalBytesProcessed)}
            </Text>
            , above the {formatEstimatedBytes(confirmEstimatedBytesAbove)}{' '}
            confirmation threshold for this connection.
        </Text>
        <Callout variant="info">
            To scan less, filter on a partitioned date, shorten the date range
            or select fewer fields.
        </Callout>
    </MantineModal>
);
