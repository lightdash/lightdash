import type { ColumnWindow } from '../Table/useColumnWindow';

export const getPivotColumnWindows = (
    columnWindow: ColumnWindow | undefined,
    {
        titleStart,
        dataStart,
        totalsStart,
    }: { titleStart: number; dataStart: number; totalsStart: number },
) => {
    if (!columnWindow)
        return {
            rowNumbers: undefined,
            titles: undefined,
            data: undefined,
            totals: undefined,
        };

    const section = (): ColumnWindow => ({ width: 0, slots: [] });
    const windows = {
        rowNumbers: section(),
        titles: section(),
        data: section(),
        totals: section(),
    };
    let nextIndex = 0;
    for (const slot of columnWindow.slots) {
        // A spacer that crosses a section boundary is still one physical <col>.
        const index = slot.index ?? nextIndex;
        const [target, offset] =
            index < titleStart
                ? ([windows.rowNumbers, 0] as const)
                : index < dataStart
                  ? ([windows.titles, titleStart] as const)
                  : index < totalsStart
                    ? ([windows.data, dataStart] as const)
                    : ([windows.totals, totalsStart] as const);
        target.slots.push(
            slot.index === undefined
                ? slot
                : { ...slot, index: index - offset },
        );
        target.width += slot.width;
        nextIndex = index + 1;
    }
    return windows;
};
