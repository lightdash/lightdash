import { FieldType, type PivotData, type TableChart } from '@lightdash/common';

type PivotHeaders = Pick<
    PivotData,
    'headerValues' | 'headerValueTypes' | 'titleFields' | 'rowTotalFields'
>;

type PivotHeaderRow = {
    index: number;
    values: PivotData['headerValues'][number];
    /** A dimension name shown as a group header across all value columns */
    groupTitle?: { fieldId: string; colSpan: number };
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
        // The metric row also carried the row-axis headings and total labels,
        // which move up to the last dimension row
        const rowAxisTitles = data.titleFields.at(-1) ?? [];
        const totalLabels = data.rowTotalFields?.at(-1);
        const displacedTitle = lastRow.titleFields.find(
            (title, index) =>
                title && rowAxisTitles[index]?.direction === 'index',
        );

        lastRow.titleFields = lastRow.titleFields.map((field, index) =>
            rowAxisTitles[index]?.direction === 'index'
                ? rowAxisTitles[index]
                : field,
        );
        lastRow.rowTotalFields = totalLabels?.map(() => ({}));

        if (displacedTitle) {
            // A row-axis heading took the dimension name's cell, so the name
            // becomes a group header above its values
            rows.splice(-1, 0, {
                index: data.headerValues.length - 1,
                values: [],
                groupTitle: {
                    fieldId: displacedTitle.fieldId,
                    colSpan: lastRow.values.length,
                },
                titleFields: lastRow.titleFields.map(() => null),
                rowTotalFields: totalLabels?.map(() => null),
            });
        }
    }
    return rows;
};
