import { type ResultRow } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type Table } from '@tanstack/react-table';
import {
    defaultRangeExtractor,
    useVirtualizer,
    type Range,
} from '@tanstack/react-virtual';
import { useCallback, useMemo, type ReactNode, type RefObject } from 'react';

type ColumnSlot = { key: string; width: number; index?: number };

export const useColumnWindow = (
    table: Table<ResultRow>,
    viewport: RefObject<HTMLDivElement | null>,
    enabled: boolean,
) => {
    const groups = table.getHeaderGroups();
    const headers = groups[0]?.headers;
    const count = headers?.length ?? 0;
    const active = enabled && groups.length === 1 && count > 40;
    const getItemKey = useCallback((i: number) => headers![i].id, [headers]);
    const pinned = useMemo(
        () =>
            headers?.flatMap((header, i) =>
                header.column.getIsPinned() ? [i] : [],
            ) ?? [],
        [headers],
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
        count,
        getItemKey,
        estimateSize: (i) => {
            const column = headers![i].column;
            return (
                column.columnDef.meta?.width ??
                (column.columnDef.meta?.frozen ? 100 : column.getSize())
            );
        },
        overscan: 2,
        rangeExtractor,
    });
    const items = virtualizer.getVirtualItems();
    const width = virtualizer.getTotalSize();
    return useMemo(() => {
        if (!active || !headers) return undefined;
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
                key: headers[item.index].id,
                index: item.index,
                width: item.size,
            });
            end = item.end;
        }
        if (width > end)
            slots.push({ key: 'trailing-gap', width: width - end });
        return { headers, width, slots };
    }, [active, headers, items, width]);
};

export type ColumnWindow = ReturnType<typeof useColumnWindow>;

export function renderColumns(
    window: ColumnWindow,
    count: number,
    render: (index: number) => ReactNode,
) {
    if (!window) return Array.from({ length: count }, (_, i) => render(i));
    return window.slots.map((slot) =>
        slot.index === undefined ? (
            <Box component="td" aria-hidden key={slot.key} p={0} />
        ) : (
            render(slot.index)
        ),
    );
}
