import { Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
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
    /** False when the export isn't capped by the cell limit (SQL queries,
     *  and downloads that stream an already-run query's stored results). */
    cellLimitApplies: boolean;
};

const Note: FC<{ children: ReactNode }> = ({ children }) => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
        <MantineIcon icon={IconInfoCircle} size="sm" color="dimmed" />
        <Text size="xs" c="dimmed" data-testid="export-cell-limit-note">
            <Text span fw={500} c="foreground">
                Export cell limit.
            </Text>{' '}
            {children}
        </Text>
    </Group>
);

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
    cellLimitApplies,
}) => {
    const cellsLabel = csvCellsLimit.toLocaleString();

    if (!cellLimitApplies) {
        return (
            <Note>
                This export isn&apos;t capped by your organization&apos;s{' '}
                {cellsLabel}-cell limit.
            </Note>
        );
    }

    const columnCount = columnOrder?.length ?? 0;
    if (columnCount === 0) {
        return (
            <Note>
                Exports are limited to {cellsLabel} cells (rows × columns).
            </Note>
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
        <Note>
            Exports are limited to {cellsLabel} cells (rows × columns), up to{' '}
            {maxRows.toLocaleString()} rows with {columnLabel}.
        </Note>
    );
};

export default CellLimitNote;
