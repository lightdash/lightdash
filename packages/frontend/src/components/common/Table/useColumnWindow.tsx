import { Box } from '@mantine/core';
import {
    defaultRangeExtractor,
    useVirtualizer,
    type Range,
} from '@tanstack/react-virtual';
import {
    useCallback,
    useContext,
    useMemo,
    type ReactNode,
    type RefObject,
} from 'react';
import { StaticTableRenderContext } from './StaticTableRenderContext';

type WindowColumn = { id: string; width: number; pinned?: boolean };
type ColumnSlot = { key: string; width: number; index?: number };
export type ColumnWindow = { width: number; slots: ColumnSlot[] };

export function useColumnWindow(
    viewport: RefObject<HTMLElement | null>,
    columns: readonly WindowColumn[],
    enabled = true,
): ColumnWindow | undefined {
    const staticRender = useContext(StaticTableRenderContext);
    const active = enabled && !staticRender && columns.length > 40;
    const getItemKey = useCallback((i: number) => columns[i].id, [columns]);
    const pinned = useMemo(
        () => columns.flatMap((column, i) => (column.pinned ? [i] : [])),
        [columns],
    );
    const rangeExtractor = useCallback(
        (range: Range) =>
            [...new Set([...pinned, ...defaultRangeExtractor(range)])].sort(
                (a, b) => a - b,
            ),
        [pinned],
    );
    const virtualizer = useVirtualizer({
        enabled: active,
        horizontal: true,
        getScrollElement: () => viewport.current,
        count: columns.length,
        getItemKey,
        estimateSize: (i) => columns[i].width,
        overscan: 2,
        rangeExtractor,
    });
    const items = virtualizer.getVirtualItems();
    const width = virtualizer.getTotalSize();
    return useMemo(() => {
        if (!active) return undefined;
        const slots: ColumnSlot[] = [];
        let end = 0;
        for (const item of items) {
            if (item.start > end) {
                slots.push({
                    key: `gap-${item.index}`,
                    width: item.start - end,
                });
            }
            slots.push({
                key: `column-${item.key}`,
                index: item.index,
                width: item.size,
            });
            end = item.end;
        }
        if (width > end)
            slots.push({ key: 'trailing-gap', width: width - end });
        return { slots, width };
    }, [active, items, width]);
}

export function renderColumns(
    columnWindow: ColumnWindow | undefined,
    count: number,
    render: (index: number) => ReactNode,
) {
    if (!columnWindow)
        return Array.from({ length: count }, (_, i) => render(i));
    return columnWindow.slots.map((slot) =>
        slot.index === undefined ? (
            <Box component="td" aria-hidden key={slot.key} p={0} />
        ) : (
            render(slot.index)
        ),
    );
}

export function renderColumnGroups(
    columnWindow: ColumnWindow | undefined,
    groups: readonly { colSpan: number }[],
    render: (
        groupIndex: number,
        colSpan: number,
        firstColumnIndex: number,
    ) => ReactNode,
) {
    let groupStart = 0;
    if (!columnWindow) {
        return groups.map((group, index) => {
            if (group.colSpan === 0) return null;
            const first = groupStart;
            groupStart += group.colSpan;
            return render(index, group.colSpan, first);
        });
    }
    const { slots } = columnWindow;
    const cells: ReactNode[] = [];
    let groupIndex = 0;
    for (let i = 0; i < slots.length; i++) {
        const { index, key } = slots[i];
        if (index === undefined) {
            cells.push(<Box component="td" aria-hidden key={key} p={0} />);
            continue;
        }
        while (
            groupIndex < groups.length &&
            index >= groupStart + groups[groupIndex].colSpan
        ) {
            groupStart += groups[groupIndex++].colSpan;
        }
        if (groupIndex === groups.length) break;
        const end = groupStart + groups[groupIndex].colSpan;
        let colSpan = 1;
        while (
            index + colSpan < end &&
            slots[i + colSpan]?.index === index + colSpan
        ) {
            colSpan++;
        }
        cells.push(render(groupIndex, colSpan, index));
        i += colSpan - 1;
    }
    return cells;
}
