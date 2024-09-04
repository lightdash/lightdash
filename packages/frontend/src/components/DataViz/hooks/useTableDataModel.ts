import {
    ChartKind,
    TableDataModel,
    type VizColumnsConfig,
    type VizTableConfig,
} from '@lightdash/common';
import { useMemo } from 'react';
import { type ResultsRunner } from '../transformers/ResultsRunner';
import useDataVizTable from './useDataVizTable';

export const useTableDataModel = <T extends ResultsRunner>({
    columnsConfig,
    resultsRunner,
}: {
    columnsConfig: VizColumnsConfig;
    resultsRunner: T;
}) => {
    const tableModel = useMemo(() => {
        // TODO: currently usage of this hook relies just on columns, change to rely on full config so we don't have to create a dummy config
        const tableConfig: VizTableConfig = {
            type: ChartKind.TABLE,
            metadata: {
                version: 1,
            },
            columns: columnsConfig,
        };

        return new TableDataModel({
            resultsRunner,
            config: tableConfig,
        });
    }, [resultsRunner, columnsConfig]);

    const columns = useMemo(() => tableModel.getVisibleColumns(), [tableModel]);
    const rows = useMemo(() => tableModel.getRows(), [tableModel]);

    return useDataVizTable(
        columns,
        rows,
        columnsConfig,
        resultsRunner.getColumnsAccessorFn,
    );
};
