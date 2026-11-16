import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconArrowBackUp,
    IconArrowForwardUp,
    type Icon,
} from '@tabler/icons-react';
import { memo, useCallback, type FC } from 'react';
import {
    dashboardEditActions,
    selectCanRedoTileLayout,
    selectCanUndoTileLayout,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import MantineIcon from '../MantineIcon';
import {
    EDIT_SHORTCUTS,
    toHotkeyItems,
    type EditShortcut,
} from './editShortcuts';
import { ShortcutHint, ShortcutTooltipLabel } from './ShortcutHint';

type HistoryButtonProps = {
    label: string;
    shortcut: EditShortcut;
    icon: Icon;
    disabled: boolean;
    onClick: () => void;
};

const HistoryButton: FC<HistoryButtonProps> = ({
    label,
    shortcut,
    icon,
    disabled,
    onClick,
}) => (
    <ShortcutHint shortcut={shortcut} position="top">
        <Tooltip
            label={<ShortcutTooltipLabel label={label} shortcut={shortcut} />}
        >
            <ActionIcon
                size="md"
                aria-label={label}
                disabled={disabled}
                onClick={onClick}
            >
                <MantineIcon icon={icon} />
            </ActionIcon>
        </Tooltip>
    </ShortcutHint>
);

// Subscribes on its own, so a move re-renders these buttons and not the header
export const TileLayoutHistoryButtons = memo(() => {
    const dispatch = useDashboardDispatch();
    const canUndo = useDashboardSelector(selectCanUndoTileLayout);
    const canRedo = useDashboardSelector(selectCanRedoTileLayout);

    const undo = useCallback(
        () => dispatch(dashboardEditActions.undoTileLayout()),
        [dispatch],
    );
    const redo = useCallback(
        () => dispatch(dashboardEditActions.redoTileLayout()),
        [dispatch],
    );

    useHotkeys([
        ...toHotkeyItems(EDIT_SHORTCUTS.undo, undo),
        ...toHotkeyItems(EDIT_SHORTCUTS.redo, redo),
    ]);

    return (
        <Group gap="xxs" wrap="nowrap">
            <HistoryButton
                label="Undo"
                shortcut={EDIT_SHORTCUTS.undo}
                icon={IconArrowBackUp}
                disabled={!canUndo}
                onClick={undo}
            />
            <HistoryButton
                label="Redo"
                shortcut={EDIT_SHORTCUTS.redo}
                icon={IconArrowForwardUp}
                disabled={!canRedo}
                onClick={redo}
            />
        </Group>
    );
});
TileLayoutHistoryButtons.displayName = 'TileLayoutHistoryButtons';
