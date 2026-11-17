import { Center, SegmentedControl, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconColumns3,
    IconGrid4x4,
    IconGridDots,
    type Icon,
} from '@tabler/icons-react';
import { memo } from 'react';
import {
    dashboardEditActions,
    selectCanvasBackground,
    useDashboardDispatch,
    useDashboardSelector,
    type CanvasBackground,
} from '../../../features/dashboard/store';
import MantineIcon from '../MantineIcon';
import { EDIT_SHORTCUTS, nextInCycle, toHotkeyItems } from './editShortcuts';
import { ShortcutHint } from './ShortcutHint';

const OPTIONS: {
    value: CanvasBackground;
    icon: Icon;
    tooltip: string;
}[] = [
    { value: 'grid', icon: IconGrid4x4, tooltip: 'Grid background' },
    { value: 'dots', icon: IconGridDots, tooltip: 'Dotted background' },
    { value: 'columns', icon: IconColumns3, tooltip: 'Column guides' },
];

const isCanvasBackground = (value: string): value is CanvasBackground =>
    OPTIONS.some((option) => option.value === value);

export const CanvasBackgroundControl = memo(() => {
    const dispatch = useDashboardDispatch();
    const background = useDashboardSelector(selectCanvasBackground);

    useHotkeys(
        toHotkeyItems(EDIT_SHORTCUTS.background, () =>
            dispatch(
                dashboardEditActions.setCanvasBackground(
                    nextInCycle(
                        OPTIONS.map((option) => option.value),
                        background,
                    ),
                ),
            ),
        ),
    );

    return (
        <ShortcutHint shortcut={EDIT_SHORTCUTS.background} position="top">
            <SegmentedControl
                size="xs"
                aria-label="Canvas background while editing"
                value={background}
                onChange={(next) => {
                    if (isCanvasBackground(next))
                        dispatch(
                            dashboardEditActions.setCanvasBackground(next),
                        );
                }}
                data={OPTIONS.map((option) => ({
                    value: option.value,
                    label: (
                        <Tooltip
                            label={option.tooltip}
                            position="bottom"
                            openDelay={200}
                        >
                            <Center aria-label={option.tooltip}>
                                <MantineIcon icon={option.icon} />
                            </Center>
                        </Tooltip>
                    ),
                }))}
            />
        </ShortcutHint>
    );
});
CanvasBackgroundControl.displayName = 'CanvasBackgroundControl';
