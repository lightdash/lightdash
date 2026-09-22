import {
    normalizeIndexColumns,
    type DataAppVizContext,
} from '@lightdash/common';

/** The rows a modal lists, with a label per column; independent of a schema
 *  so a query can be inspected before any version exists. */
export type ChartTypeRows = {
    rows: DataAppVizContext['rows'];
    pivotDetails: DataAppVizContext['pivotDetails'];
    labels: Record<string, string>;
};

export const rowsFromVizContext = (
    context: DataAppVizContext,
): ChartTypeRows => ({
    rows: context.rows,
    pivotDetails: context.pivotDetails,
    labels: Object.fromEntries(
        Object.entries(context.fields).map(([id, field]) => [id, field.label]),
    ),
});

/** One column per key the rows carry; pivoted rows get one per pivot value. */
export type ChartTypeRowColumn = { reference: string; label: string };

export const getChartTypeRowColumns = ({
    rows,
    pivotDetails,
    labels,
}: ChartTypeRows): ChartTypeRowColumn[] => {
    if (!pivotDetails) {
        return Object.keys(rows[0] ?? {}).map((reference) => ({
            reference,
            label: labels[reference] ?? reference,
        }));
    }

    const indexColumns = normalizeIndexColumns(pivotDetails.indexColumn).map(
        ({ reference }) => ({
            reference,
            label:
                labels[reference] ??
                pivotDetails.originalColumns[reference]?.label ??
                reference,
        }),
    );
    const valueColumns = pivotDetails.valuesColumns.map((column) => ({
        reference: column.pivotColumnName,
        label: [
            labels[column.referenceField] ??
                pivotDetails.originalColumns[column.referenceField]?.label ??
                column.referenceField,
            ...column.pivotValues.map((value) => value.formatted),
        ].join(' · '),
    }));

    return [...indexColumns, ...valueColumns];
};
