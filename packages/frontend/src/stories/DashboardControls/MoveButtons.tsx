import { Button, Group } from '@mantine/core';
import { type FC } from 'react';
import { type MoveDirection } from '../../features/dashboardControls/useControlsSidebar';

// From `FilterSettings.tsx` (not exported, and bound to the sidebar provider):
// the pill's place on the bar, as Alt with an arrow on it. An end stays
// focusable, so a press that reaches it keeps the focus
export const MoveButtons: FC<{
    canMoveLeft: boolean;
    canMoveRight: boolean;
    onMove: (direction: MoveDirection) => void;
}> = ({ canMoveLeft, canMoveRight, onMove }) => {
    const moveButton = (
        label: string,
        direction: MoveDirection,
        isEnd: boolean,
    ) => (
        <Button
            size="xs"
            variant="default"
            data-disabled={isEnd || undefined}
            aria-disabled={isEnd || undefined}
            onClick={() => {
                if (!isEnd) onMove(direction);
            }}
        >
            {label}
        </Button>
    );
    return (
        <Group gap="xs" grow>
            {moveButton('Move left', 'left', !canMoveLeft)}
            {moveButton('Move right', 'right', !canMoveRight)}
        </Group>
    );
};
