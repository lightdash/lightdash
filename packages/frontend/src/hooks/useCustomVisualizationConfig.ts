import {
    type ApiQueryResults,
    type CustomVis,
    type ResultRow,
} from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';

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

export interface CustomVisualizationConfigAndData {
    validConfig: CustomVis;
    visSpec?: string;
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
): CustomVisualizationConfigAndData => {
    const [visSpec, setVisSpec] = useState<string | undefined>();
    const [visSpecObject, setVisSpecObject] = useState();

    // Set initial value
    useEffect(() => {
        try {
            if (chartConfig?.spec && !visSpec) {
                setVisSpec(JSON.stringify(chartConfig?.spec, null, 2));
            }
        } catch (e) {
            //TODO: handle error
        }
    }, [chartConfig?.spec, visSpec]);

    // Update object when spec changes
    useEffect(() => {
        try {
            if (visSpec) {
                setVisSpecObject(JSON.parse(visSpec));
            }
        } catch (e) {
            //TODO: handle error
        }
    }, [visSpec]);

    const rows = useMemo(() => resultsData?.rows, [resultsData]);

    const convertedRows = useMemo(() => {
        return rows ? convertRowsToSeries(rows) : [];
    }, [rows]);

    const fields = useMemo(() => {
        return rows && rows.length > 0 ? Object.keys(rows[0]) : [];
    }, [rows]);

    return {
        validConfig: { spec: visSpecObject },
        visSpec: visSpec,
        setVisSpec,
        series: convertedRows,
        fields,
    };
};

export default useCustomVisualizationConfig;
