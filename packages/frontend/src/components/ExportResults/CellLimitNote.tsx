import { Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';
import {
    getCellLimitedRowCount,
    getExportRowCount,
} from './exportCellEstimate';
import { type Limit } from './types';

type CellLimitNoteProps = {
    limit: Limit;
    customLimit: number;
    totalResults: number;
    columnOrder: string[] | undefined;
    csvCellsLimit: number;
};

/**
 * Shows the organization's effective CSV/Excel cell limit before export, and
 * warns when the selected rows won't fit so the file will be truncated.
 */
const CellLimitNote: FC<CellLimitNoteProps> = ({
    limit,
    customLimit,
    totalResults,
    columnOrder,
    csvCellsLimit,
}) => {
    const columnCount = columnOrder?.length ?? 0;
    const cellsLabel = csvCellsLimit.toLocaleString();

    if (columnCount === 0) {
        return (
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <MantineIcon icon={IconInfoCircle} size="sm" color="dimmed" />
                <Text size="xs" c="dimmed" data-testid="export-cell-limit-note">
                    <Text span fw={500} c="foreground">
                        Export cell limit.
                    </Text>{' '}
                    Exports are limited to {cellsLabel} cells (rows × columns).
                </Text>
            </Group>
        );
    }

    const maxRows = getCellLimitedRowCount(csvCellsLimit, columnCount);
    const rowCount = getExportRowCount(limit, customLimit, totalResults);
    const columnLabel = `${columnCount.toLocaleString()} ${
        columnCount === 1 ? 'column' : 'columns'
    }`;

    if (rowCount > maxRows) {
        return (
            <Callout
                variant="warning"
                title="This export will be truncated"
                data-testid="export-cell-limit-warning"
            >
                Exports are limited to {cellsLabel} cells (rows × columns). With{' '}
                {columnLabel}, only the first {maxRows.toLocaleString()} of{' '}
                {rowCount.toLocaleString()} rows will be included. Remove
                columns or filter the results to export everything.
            </Callout>
        );
    }

    return (
        <Group gap="xs" wrap="nowrap" align="flex-start">
            <MantineIcon icon={IconInfoCircle} size="sm" color="dimmed" />
            <Text size="xs" c="dimmed" data-testid="export-cell-limit-note">
                <Text span fw={500} c="foreground">
                    Export cell limit.
                </Text>{' '}
                Exports are limited to {cellsLabel} cells (rows × columns), up
                to {maxRows.toLocaleString()} rows with {columnLabel}.
            </Text>
        </Group>
    );
};

export default CellLimitNote;
