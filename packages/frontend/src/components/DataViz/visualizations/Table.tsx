import {
    TableDataModel,
    type IResultsRunner,
    type VizColumnsConfig,
} from '@lightdash/common';
import { useMemo, type ComponentProps } from 'react';
import { calculateColumnStats } from '../utils/columnStats';
import { ResultsTable } from './ChartDataTable';

type TableProps = Omit<
    ComponentProps<typeof ResultsTable>,
    'columnNames' | 'rows' | 'meta' | 'showGroupColumnTooltip'
> & {
    columnsConfig: VizColumnsConfig;
    resultsRunner: IResultsRunner;
};

export const Table = ({
    resultsRunner,
    columnsConfig,
    ...props
}: TableProps) => {
    const data = useMemo(() => {
        const model = new TableDataModel({ resultsRunner, columnsConfig });
        const columnNames = model.getVisibleColumns();
        const rows = model.getRows();
        const config = model.getConfig();
        const barColumns = columnNames.filter(
            (name) => config?.[name]?.displayStyle === 'bar',
        );
        return {
            columnNames,
            rows,
            columnsConfig: config,
            meta: {
                columnsConfig: config,
                columnStats: barColumns.length
                    ? calculateColumnStats(rows, barColumns)
                    : {},
            },
        };
    }, [resultsRunner, columnsConfig]);
    return <ResultsTable {...data} {...props} />;
};
