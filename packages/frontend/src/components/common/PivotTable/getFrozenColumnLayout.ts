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
};

const getFreezeKey = (col: PivotColumn): string | undefined => {
    if (col.columnType === 'indexValue' || col.columnType === 'label') {
        return col.fieldId;
    }
    return col.underlyingId ?? col.baseId;
};

const getColumnWidth = (
    freezeKey: string,
    columnProperties: Record<string, ColumnProperties | undefined>,
    defaultColumnWidth: number,
): number => columnProperties[freezeKey]?.width ?? defaultColumnWidth;

export const getFrozenColumnLayout = ({
    pivotColumnInfo,
    columnProperties,
    rowNumberWidth,
    defaultColumnWidth,
}: Args): Map<string, FrozenColumnEntry> => {
    const layout = new Map<string, FrozenColumnEntry>();
    let cumulativeLeft = rowNumberWidth;
    let lastFrozenFieldId: string | undefined;

    for (const col of pivotColumnInfo) {
        const freezeKey = getFreezeKey(col);
        if (!freezeKey) continue;

        const isFrozen = columnProperties[freezeKey]?.frozen === true;
        if (!isFrozen) continue;

        const width = getColumnWidth(
            freezeKey,
            columnProperties,
            defaultColumnWidth,
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
