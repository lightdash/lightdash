import { ActionIcon, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { memo } from 'react';
import {
    dashboardEditActions,
    selectCanTidyTiles,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import MantineIcon from '../MantineIcon';
import { EDIT_SHORTCUTS, toHotkeyItems } from './editShortcuts';
import { ShortcutHint, ShortcutTooltipLabel } from './ShortcutHint';

export const TidyTilesButton = memo(() => {
    const dispatch = useDashboardDispatch();
    const canTidy = useDashboardSelector(selectCanTidyTiles);
    const tidy = () => dispatch(dashboardEditActions.tidyTiles());

    useHotkeys(
        toHotkeyItems(EDIT_SHORTCUTS.tidy, () => {
            if (canTidy) tidy();
        }),
    );

    return (
        <ShortcutHint shortcut={EDIT_SHORTCUTS.tidy} position="top">
            <Tooltip
                label={
                    canTidy ? (
                        <ShortcutTooltipLabel
                            label="Tidy layout"
                            shortcut={EDIT_SHORTCUTS.tidy}
                        />
                    ) : (
                        'Tiles are already tidy'
                    )
                }
            >
                <ActionIcon
                    size="md"
                    aria-label="Tidy tiles"
                    disabled={!canTidy}
                    onClick={tidy}
                >
                    <MantineIcon icon={IconLayoutDashboard} />
                </ActionIcon>
            </Tooltip>
        </ShortcutHint>
    );
});
TidyTilesButton.displayName = 'TidyTilesButton';
