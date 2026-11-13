import { Center, SegmentedControl, Tooltip } from '@mantine/core';
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

    return (
        <SegmentedControl
            size="xs"
            aria-label="Canvas background while editing"
            value={background}
            onChange={(next) => {
                if (isCanvasBackground(next))
                    dispatch(dashboardEditActions.setCanvasBackground(next));
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
    );
});
CanvasBackgroundControl.displayName = 'CanvasBackgroundControl';
