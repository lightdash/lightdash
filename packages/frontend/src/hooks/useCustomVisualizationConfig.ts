import {
    ApiQueryResults,
    CustomVis,
    ItemsMap,
    ResultRow,
} from '@lightdash/common';
import { useMemo, useState } from 'react';

const convertRowsToSeries = (rows: ResultRow[]) => {
    return rows.map((row) => {
        return Object.fromEntries(
            Object.entries(row).map(([key, rowValue]) => [
                key,
                rowValue.value.raw,
            ]),
        );
    });
};

export interface CustomVisualizationProps {
    validConfig: CustomVis;
    setVisSpec: (spec: string) => void;
    // TODO: do we need to type this better?
    series: {
        [k: string]: unknown;
    }[];
    fields?: string[];
}

const useCustomVisualizationConfig = (
    chartConfig: CustomVis | undefined,
    resultsData: ApiQueryResults | undefined,
    itemsMap: ItemsMap | undefined,
): CustomVisualizationProps => {
    console.log('chartConfig', { chartConfig, resultsData, itemsMap });

    const [visSpec, setVisSpec] = useState<string | undefined>(
        chartConfig?.spec,
    );

    const rows = useMemo(() => resultsData?.rows, [resultsData]);

    const convertedRows = useMemo(() => {
        return rows ? convertRowsToSeries(rows) : [];
    }, [rows]);

    const fields = useMemo(() => {
        return rows && rows.length > 0 ? Object.keys(rows[0]) : [];
    }, [rows]);

    return {
        validConfig: { spec: visSpec },
        setVisSpec,
        series: convertedRows,
        fields,
    };
};

export default useCustomVisualizationConfig;
