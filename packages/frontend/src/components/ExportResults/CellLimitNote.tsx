import { Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';
import {
    getCellLimitedRowCount,
    getRequestedExportRowCount,
} from './exportCellEstimate';
import { type Limit } from './types';

type CellLimitNoteProps = {
    limit: Limit;
    customLimit: number;
    totalResults: number;
    columnOrder: string[] | undefined;
    csvCellsLimit: number;
    /** False when this export, in the selected scope, isn't capped by the
     *  cell limit (SQL queries, and downloads that stream an already-run
     *  query's stored results). */
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
    const requestedRows = getRequestedExportRowCount(
        limit,
        customLimit,
        totalResults,
    );
    // "All results" has no known row count up front, but it returns at least
    // the rows already loaded, so those alone can show it won't fit.
    const knownRows = requestedRows ?? totalResults;
    const columnLabel = `${columnCount.toLocaleString()} ${
        columnCount === 1 ? 'column' : 'columns'
    }`;

    if (knownRows > maxRows) {
        const keptRows = maxRows.toLocaleString();
        return (
            <Callout
                variant="warning"
                title="This export will be truncated"
                data-testid="export-cell-limit-warning"
            >
                Exports are limited to {cellsLabel} cells (rows × columns). With{' '}
                {columnLabel},{' '}
                {requestedRows === null
                    ? `only the first ${keptRows} rows will be included.`
                    : `only the first ${keptRows} of ${requestedRows.toLocaleString()} rows will be included.`}{' '}
                Remove columns or filter the results to export everything.
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
