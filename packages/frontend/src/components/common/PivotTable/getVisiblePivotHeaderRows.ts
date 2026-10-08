import { FieldType, type PivotData, type TableChart } from '@lightdash/common';

type PivotHeaders = Pick<
    PivotData,
    'headerValues' | 'headerValueTypes' | 'titleFields' | 'rowTotalFields'
>;

type PivotHeaderRow = {
    index: number;
    values: PivotData['headerValues'][number];
    /** Header rows the value and total cells of this row span */
    valueRowSpan: number;
    titleFields: PivotData['titleFields'][number];
    rowTotalFields:
        | NonNullable<PivotData['rowTotalFields']>[number]
        | undefined;
};

// Keep the original PivotData intact: cell identities and interactions use its metric headers.
export const getVisiblePivotHeaderRows = (
    data: PivotHeaders,
    {
        hideMetricNames,
        hidePivotDimensionNames,
    }: Pick<TableChart, 'hideMetricNames' | 'hidePivotDimensionNames'>,
) => {
    const rows: PivotHeaderRow[] = data.headerValues
        .map((values, index) => ({
            // position in data.headerValues, which cell lookups still use
            index,
            values,
            valueRowSpan: 1,
            titleFields: data.titleFields[index].map((field) =>
                hidePivotDimensionNames && field?.direction === 'header'
                    ? null
                    : field,
            ),
            rowTotalFields: data.rowTotalFields?.[index],
        }))
        .filter(
            ({ index }) =>
                !hideMetricNames ||
                data.headerValues.length === 1 ||
                data.headerValueTypes[index]?.type !== FieldType.METRIC,
        );

    const lastRow = rows.at(-1);
    if (hideMetricNames && lastRow && rows.length < data.headerValues.length) {
        // The metric row also carried the row-axis headings and total labels
        const rowAxisTitles = data.titleFields.at(-1) ?? [];
        lastRow.rowTotalFields = data.rowTotalFields?.at(-1)?.map(() => ({}));

        const sharesCellWithDimensionName = rowAxisTitles.some(
            (title, index) =>
                title?.direction === 'index' && lastRow.titleFields[index],
        );
        if (sharesCellWithDimensionName) {
            // Both names stay: the headings keep their own row and the
            // dimension values span it
            lastRow.valueRowSpan = 2;
            rows.push({
                index: data.headerValues.length - 1,
                values: [],
                valueRowSpan: 1,
                titleFields: rowAxisTitles,
                rowTotalFields: undefined,
            });
        } else {
            lastRow.titleFields = lastRow.titleFields.map((field, index) =>
                rowAxisTitles[index]?.direction === 'index'
                    ? rowAxisTitles[index]
                    : field,
            );
        }
    }
    return rows;
};
