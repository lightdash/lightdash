import { ActionIcon, Group, Kbd, Text, Tooltip } from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
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

type HistoryButtonProps = {
    label: string;
    keys: string[];
    icon: Icon;
    disabled: boolean;
    onClick: () => void;
};

const HistoryButton: FC<HistoryButtonProps> = ({
    label,
    keys,
    icon,
    disabled,
    onClick,
}) => (
    <Tooltip
        label={
            <Group gap="xs" wrap="nowrap">
                <Text fz="xs" inherit>
                    {label}
                </Text>
                <Group gap="xxs" wrap="nowrap">
                    {keys.map((key) => (
                        <Kbd key={key} size="xs">
                            {key}
                        </Kbd>
                    ))}
                </Group>
            </Group>
        }
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
);

// Subscribes on its own, so a move re-renders these buttons and not the header
export const TileLayoutHistoryButtons = memo(() => {
    const dispatch = useDashboardDispatch();
    const canUndo = useDashboardSelector(selectCanUndoTileLayout);
    const canRedo = useDashboardSelector(selectCanRedoTileLayout);
    const os = useOs();
    const modKey = os === 'macos' || os === 'ios' ? '⌘' : 'Ctrl';

    const undo = useCallback(
        () => dispatch(dashboardEditActions.undoTileLayout()),
        [dispatch],
    );
    const redo = useCallback(
        () => dispatch(dashboardEditActions.redoTileLayout()),
        [dispatch],
    );
    // The grid is out of reach behind a modal, so the keys leave it alone
    const unlessModalOpen = (step: () => void) => () => {
        if (document.querySelector('[aria-modal="true"]') === null) step();
    };

    useHotkeys([
        ['mod+Z', unlessModalOpen(undo)],
        ['mod+shift+Z', unlessModalOpen(redo)],
        ['mod+Y', unlessModalOpen(redo)],
    ]);

    return (
        <Group gap="xxs" wrap="nowrap">
            <HistoryButton
                label="Undo"
                keys={[modKey, 'Z']}
                icon={IconArrowBackUp}
                disabled={!canUndo}
                onClick={undo}
            />
            <HistoryButton
                label="Redo"
                keys={[modKey, '⇧', 'Z']}
                icon={IconArrowForwardUp}
                disabled={!canRedo}
                onClick={redo}
            />
        </Group>
    );
});
TileLayoutHistoryButtons.displayName = 'TileLayoutHistoryButtons';
