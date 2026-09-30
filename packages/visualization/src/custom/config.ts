import { type CustomVis, type ResultRow } from '@lightdash/common';
import { type VisualizationResults } from '../types';

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

export type CustomVisualizationData = {
    /** One object per row, keyed by field id, holding the raw values. */
    series: {
        [k: string]: unknown;
    }[];
    /** The field ids of the first row. */
    fields: string[];
};

/** The rows as the raw values a Vega spec plots. */
export const buildCustomVisualizationData = (
    resultsData: Pick<VisualizationResults, 'rows'> | undefined,
): CustomVisualizationData => {
    const rows = resultsData?.rows;
    return {
        series: rows ? convertRowsToSeries(rows) : [],
        fields: rows && rows.length > 0 ? Object.keys(rows[0]) : [],
    };
};

/** The spec as the editor's JSON text; undefined when it cannot be serialised. */
export const serializeCustomVisualizationSpec = (
    spec: CustomVis['spec'],
): string | undefined => {
    try {
        return JSON.stringify(spec, null, 2);
    } catch (e) {
        //TODO: handle error
        return undefined;
    }
};

/** The editor's JSON text as a spec; undefined when it is not valid JSON. */
export const parseCustomVisualizationSpec = (
    visSpec: string,
): CustomVis['spec'] => {
    try {
        return JSON.parse(visSpec);
    } catch (e) {
        //TODO: handle error
        return undefined;
    }
};

export type ResolveCustomVisualizationConfigArgs = {
    chartConfig: CustomVis | undefined;
};

/**
 * Resolves a saved custom visualization config the way the editor does when
 * it first mounts: the spec goes through its JSON text, so it holds only
 * what JSON keeps.
 */
export const resolveCustomVisualizationConfig = ({
    chartConfig,
}: ResolveCustomVisualizationConfigArgs): CustomVis => {
    const visSpec = chartConfig?.spec
        ? serializeCustomVisualizationSpec(chartConfig.spec)
        : undefined;
    return {
        spec: visSpec ? parseCustomVisualizationSpec(visSpec) : undefined,
    };
};
