import type { ColumnProperties, PivotColumn } from '@lightdash/common';

export type FrozenColumnEntry = {
    left: number;
    isLast: boolean;
};

type Args = {
    pivotColumnInfo: PivotColumn[];
    columnProperties: Record<string, ColumnProperties | undefined>;
    rowNumberWidth: number;
    defaultColumnWidth: number;
    /**
     * Actual rendered widths keyed by pivot col.fieldId, populated at runtime
     * via ResizeObserver. When present for a column, this takes precedence
     * over columnProperties[freezeKey].width — keeps frozen offsets aligned
     * with the real cell width even for auto-sized columns.
     */
    measuredWidths?: Map<string, number>;
    /**
     * When metricsAsRows is true, the leftmost label column holds metric
     * names like "Total order amount". Its synthetic fieldId (e.g. "label-0")
     * isn't a key in columnProperties — instead the freeze toggle writes to
     * the underlying metric fieldId. The caller pre-computes "is any metric
     * shown as a row-label frozen?" and passes it here so the layout can
     * treat the label column as frozen.
     */
    labelColumnFrozen?: boolean;
};

const getFreezeKey = (col: PivotColumn): string | undefined => {
    if (col.columnType === 'indexValue' || col.columnType === 'label') {
        return col.fieldId;
    }
    return col.underlyingId ?? col.baseId;
};

const getColumnWidth = (
    col: PivotColumn,
    freezeKey: string,
    columnProperties: Record<string, ColumnProperties | undefined>,
    defaultColumnWidth: number,
    measuredWidths?: Map<string, number>,
): number => {
    const measured = measuredWidths?.get(col.fieldId);
    if (measured !== undefined) return measured;
    return columnProperties[freezeKey]?.width ?? defaultColumnWidth;
};

export const getFrozenColumnLayout = ({
    pivotColumnInfo,
    columnProperties,
    rowNumberWidth,
    defaultColumnWidth,
    measuredWidths,
    labelColumnFrozen = false,
}: Args): Map<string, FrozenColumnEntry> => {
    const layout = new Map<string, FrozenColumnEntry>();
    let cumulativeLeft = rowNumberWidth;
    let lastFrozenFieldId: string | undefined;

    for (const col of pivotColumnInfo) {
        const freezeKey = getFreezeKey(col);
        if (!freezeKey) continue;

        const isFrozen =
            col.columnType === 'label'
                ? labelColumnFrozen
                : columnProperties[freezeKey]?.frozen === true;
        if (!isFrozen) continue;

        const width = getColumnWidth(
            col,
            freezeKey,
            columnProperties,
            defaultColumnWidth,
            measuredWidths,
        );

        layout.set(col.fieldId, { left: cumulativeLeft, isLast: false });
        lastFrozenFieldId = col.fieldId;
        cumulativeLeft += width;
    }

    if (lastFrozenFieldId !== undefined) {
        const lastEntry = layout.get(lastFrozenFieldId)!;
        layout.set(lastFrozenFieldId, { ...lastEntry, isLast: true });
    }

    return layout;
};
