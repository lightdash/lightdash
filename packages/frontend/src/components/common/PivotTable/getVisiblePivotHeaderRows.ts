import { FieldType, type PivotData, type TableChart } from '@lightdash/common';

type PivotHeaders = Pick<
    PivotData,
    'headerValues' | 'headerValueTypes' | 'titleFields' | 'rowTotalFields'
>;

// Keep the original PivotData intact: cell identities and interactions use its metric headers.
export const getVisiblePivotHeaderRows = (
    data: PivotHeaders,
    {
        hideMetricNames,
        hidePivotDimensionNames,
    }: Pick<TableChart, 'hideMetricNames' | 'hidePivotDimensionNames'>,
) => {
    const rows = data.headerValues
        .map((values, index) => ({
            // position in data.headerValues, which cell lookups still use
            index,
            values,
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
        lastRow.titleFields = lastRow.titleFields.map((field, index) => {
            const indexTitle = data.titleFields.at(-1)?.[index];
            return indexTitle?.direction === 'index' ? indexTitle : field;
        });
        lastRow.rowTotalFields = data.rowTotalFields?.at(-1)?.map(() => ({}));
    }
    return rows;
};
