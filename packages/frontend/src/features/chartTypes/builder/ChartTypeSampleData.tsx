import {
    normalizeIndexColumns,
    type DataAppVizContext,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../components/common/ContentTable';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import classes from './ChartTypeSampleData.module.css';

type Column = { reference: string; label: string };
type SampleRow = DataAppVizContext['rows'][number];

const getColumns = (context: DataAppVizContext): Column[] => {
    if (!context.pivotDetails) {
        return Object.keys(context.rows[0] ?? {}).map((reference) => ({
            reference,
            label: context.fields[reference]?.label ?? reference,
        }));
    }

    const indexColumns = normalizeIndexColumns(
        context.pivotDetails.indexColumn,
    ).map(({ reference }) => ({
        reference,
        label:
            context.fields[reference]?.label ??
            context.pivotDetails?.originalColumns[reference]?.label ??
            reference,
    }));
    const valueColumns = context.pivotDetails.valuesColumns.map((column) => ({
        reference: column.pivotColumnName,
        label: [
            context.fields[column.referenceField]?.label ??
                context.pivotDetails?.originalColumns[column.referenceField]
                    ?.label ??
                column.referenceField,
            ...column.pivotValues.map((value) => value.formatted),
        ].join(' · '),
    }));

    return [...indexColumns, ...valueColumns];
};

const cellValue = (value: SampleRow[string]) => value?.value.formatted ?? '';

type Props = { context: DataAppVizContext | null };

export const ChartTypeSampleData: FC<Props> = ({ context }) => {
    const [opened, setOpened] = useState(false);
    const availableColumns = useMemo(
        () => (context ? getColumns(context) : []),
        [context],
    );
    const columns = useMemo<ContentTableColumnDef<SampleRow>[]>(
        () =>
            availableColumns.map((column) => ({
                id: column.reference,
                header: column.label,
                accessorFn: (row) => cellValue(row[column.reference]),
                enableSorting: false,
            })),
        [availableColumns],
    );
    const table = useContentTable({
        columns,
        data: context?.rows ?? [],
        enableBottomToolbar: false,
        enableColumnResizing: false,
        enableEditing: false,
        enablePagination: false,
        enableRowActions: false,
        enableRowSelection: false,
        enableSorting: false,
        enableTopToolbar: false,
        mantineTableContainerProps: {
            className: classes.tableContainer,
            role: 'region',
            tabIndex: 0,
            'aria-label': 'Generated sample data rows',
        },
        mantineTableProps: {
            'aria-label': 'Generated sample data',
            highlightOnHover: true,
        },
    });
    if (!context || availableColumns.length === 0) return null;

    const rowLabel = context.rows.length === 1 ? 'row' : 'rows';
    const launcherLabel = `View sample data · ${context.rows.length} ${rowLabel}`;

    return (
        <>
            <Button
                variant="subtle"
                size="compact-xs"
                className={classes.launcher}
                leftSection={<MantineIcon icon={IconTable} size={14} />}
                onClick={() => setOpened(true)}
            >
                {launcherLabel}
            </Button>
            <MantineModal
                opened={opened}
                onClose={() => setOpened(false)}
                title="Sample data"
                subtitle="Generated example values used in this preview."
                size="min(1200px, 90vw)"
            >
                <ContentTable table={table} />
            </MantineModal>
        </>
    );
};
