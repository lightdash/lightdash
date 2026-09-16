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
        .map((headerValues, headerRowIndex) => ({
            headerRowIndex,
            headerValues,
            titleFields: data.titleFields[headerRowIndex].map((field) =>
                hidePivotDimensionNames && field?.direction === 'header'
                    ? null
                    : field,
            ),
            rowTotalFields: data.rowTotalFields?.[headerRowIndex],
        }))
        .filter(
            ({ headerRowIndex }) =>
                !hideMetricNames ||
                data.headerValues.length === 1 ||
                data.headerValueTypes[headerRowIndex]?.type !==
                    FieldType.METRIC,
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
