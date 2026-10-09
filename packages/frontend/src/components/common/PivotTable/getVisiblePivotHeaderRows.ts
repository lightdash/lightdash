import { FieldType, type PivotData, type TableChart } from '@lightdash/common';

type PivotHeaders = Pick<
    PivotData,
    'headerValues' | 'headerValueTypes' | 'titleFields' | 'rowTotalFields'
>;

type TotalLabel = NonNullable<PivotData['rowTotalFields']>[number][number];

// Keep the original PivotData intact: cell identities and interactions use its metric headers.
export const getVisiblePivotHeaderRows = (
    data: PivotHeaders,
    { hideMetricNames }: Pick<TableChart, 'hideMetricNames'>,
) => {
    const rows = data.headerValues.map((values, index) => ({
        // position in data.headerValues, which cell lookups still use
        index,
        values,
        titleFields: data.titleFields[index],
        rowTotalFields: data.rowTotalFields?.[index],
    }));

    const hasMetricRow =
        data.headerValues.length > 1 &&
        data.headerValueTypes.at(-1)?.type === FieldType.METRIC;
    if (!hideMetricNames || !hasMetricRow) return rows;

    // Without the metric row only dimension values are left as column
    // headers, so the pivoted dimension names go too. The row-axis headings
    // and total labels the metric row carried move to the last row.
    const metricRow = rows[rows.length - 1];
    return rows.slice(0, -1).map((row, rowIndex, visibleRows) => {
        const isLastRow = rowIndex === visibleRows.length - 1;
        return {
            ...row,
            titleFields: row.titleFields.map((title, index) => {
                const rowAxisTitle = metricRow.titleFields[index];
                if (isLastRow && rowAxisTitle?.direction === 'index') {
                    return rowAxisTitle;
                }
                return title?.direction === 'header' ? null : title;
            }),
            rowTotalFields: isLastRow
                ? metricRow.rowTotalFields?.map((): TotalLabel => ({}))
                : row.rowTotalFields,
        };
    });
};
