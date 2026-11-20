import type { PivotData, TotalField } from '@lightdash/common';
import {
    COLUMN_WIDTH_SAMPLE_ROWS,
    measureColumnWidth,
} from '../Table/measureColumnWidth';

export const PIVOT_CELL_PADDING = { header: 24, body: 24 };

export function getPivotColumnWidths(
    data: PivotData,
    getFieldLabel: (id: string) => string | undefined,
    hasTitleSortIcon: (fieldId: string) => boolean,
    hasMetricSortIcon: (row: number, column: number) => boolean,
    getColumnTotal: (
        total: number,
        row: number,
        col: number,
    ) => string | undefined,
    getGrandTotal: (total: number, metric: number) => string | undefined,
): number[] {
    const titleCount = data.titleFields[0]?.length ?? 0;
    const totalsStart = titleCount + data.dataColumnCount;
    const totalCount = data.rowTotalFields?.[0]?.length ?? 0;
    const widths = Array<number>(totalsStart + totalCount).fill(0);
    const headerWidths = new Map<string, number>();
    const measureHeader = (label: string) => {
        let width = headerWidths.get(label);
        if (width === undefined) {
            width = measureColumnWidth(label, [], 0, PIVOT_CELL_PADDING);
            headerWidths.set(label, width);
        }
        return width;
    };
    const totalLabel = (field: TotalField) =>
        field?.fieldId ? `Total ${getFieldLabel(field.fieldId)}` : 'Total';

    for (const row of data.titleFields) {
        row.forEach((field, i) => {
            if (field)
                widths[i] = Math.max(
                    widths[i],
                    measureHeader(getFieldLabel(field.fieldId) ?? '') +
                        (hasTitleSortIcon(field.fieldId) ? 18 : 0),
                );
        });
    }
    for (const [rowIndex, row] of data.headerValues.entries()) {
        row.forEach((header, i) => {
            const span = header.type === 'value' ? header.colSpan : 1;
            if (!span) return;
            const label =
                header.type === 'value'
                    ? header.value.formatted
                    : (getFieldLabel(header.fieldId) ?? '');
            const iconWidth =
                header.type === 'label' && hasMetricSortIcon(rowIndex, i)
                    ? 18
                    : 0;
            const width = Math.ceil((measureHeader(label) + iconWidth) / span);
            for (let offset = 0; offset < span; offset++) {
                const index = titleCount + i + offset;
                widths[index] = Math.max(widths[index], width);
            }
        });
    }
    for (const [rows, start] of [
        [data.columnTotalFields, 0],
        [data.rowTotalFields, totalsStart],
    ] as const) {
        for (const row of rows ?? []) {
            row.forEach((field, i) => {
                if (field)
                    widths[start + i] = Math.max(
                        widths[start + i],
                        measureHeader(totalLabel(field)),
                    );
            });
        }
    }
    const { allCombinedData, pivotColumnInfo } = data.retrofitData;
    const sample = allCombinedData.slice(0, COLUMN_WIDTH_SAMPLE_ROWS);
    const spacerCount =
        data.indexValueTypes.length === 0 && titleCount === 1 ? 1 : 0;
    pivotColumnInfo.forEach(({ fieldId, columnType }, i) => {
        if (columnType === 'passthrough') return;
        const values = sample.map(
            (row) => row[fieldId]?.value?.formatted ?? '',
        );
        const index = i + spacerCount;
        widths[index] = Math.max(
            widths[index],
            measureColumnWidth('', values, 0, PIVOT_CELL_PADDING),
        );
    });
    const measureTotal = (i: number, label?: string) => {
        if (label)
            widths[i] = Math.max(
                widths[i],
                measureColumnWidth(label, [], 0, PIVOT_CELL_PADDING),
            );
    };
    data.columnTotals?.forEach((row, r) =>
        row.forEach((total, c) => {
            if (total !== null)
                measureTotal(titleCount + c, getColumnTotal(total, r, c));
        }),
    );
    data.grandTotals?.forEach((total, metric) => {
        if (total !== null)
            measureTotal(
                totalsStart + (data.pivotConfig.metricsAsRows ? 0 : metric),
                getGrandTotal(total, metric),
            );
    });
    return widths;
}
