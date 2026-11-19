import { Box } from '@mantine/core';
import { type ColumnWindow } from './useColumnWindow';

export function ColumnWindowColGroup({
    columnWindow,
}: {
    columnWindow?: ColumnWindow;
}) {
    if (!columnWindow) return null;
    return (
        <colgroup>
            {columnWindow.slots.map((slot) => (
                <Box
                    component="col"
                    key={slot.key}
                    data-column-index={
                        slot.index === undefined ? undefined : slot.index + 1
                    }
                    w={`calc(${slot.width}px)`}
                />
            ))}
        </colgroup>
    );
}
