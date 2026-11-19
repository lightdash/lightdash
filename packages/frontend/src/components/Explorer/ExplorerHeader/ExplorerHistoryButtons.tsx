import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import {
    IconArrowBackUp,
    IconArrowForwardUp,
    type Icon,
} from '@tabler/icons-react';
import { memo, useCallback, useRef, type FC } from 'react';
import {
    explorerHistoryActions,
    selectCanRedo,
    selectCanUndo,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import {
    EDIT_SHORTCUTS,
    type EditShortcut,
} from '../../common/Dashboard/editShortcuts';
import { ShortcutTooltipLabel } from '../../common/Dashboard/ShortcutHint';
import MantineIcon from '../../common/MantineIcon';

const NON_TEXT_INPUT_TYPES = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'radio',
    'range',
    'reset',
    'submit',
]);

// Where the keys belong to the text being typed, not to the chart
const isTextEntry = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
            !target.readOnly &&
            !NON_TEXT_INPUT_TYPES.has(target.type)));

// A modal over this explorer hides the chart the keys would change
const isBehindModal = (node: Element | null) =>
    Array.from(document.querySelectorAll('[aria-modal="true"]')).some(
        (modal) => !modal.contains(node),
    );

const travelDirection = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
    const key = event.key.toLowerCase();
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    return key === 'y' && !event.shiftKey ? 'redo' : null;
};

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
    <Tooltip
        position="bottom"
        label={<ShortcutTooltipLabel label={label} shortcut={shortcut} />}
    >
        <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
        >
            <MantineIcon icon={icon} />
        </ActionIcon>
    </Tooltip>
);

/** Undo and redo for the chart being built, by button and by keyboard */
export const ExplorerHistoryButtons = memo(() => {
    const dispatch = useExplorerDispatch();
    const canUndo = useExplorerSelector(selectCanUndo);
    const canRedo = useExplorerSelector(selectCanRedo);
    const ref = useRef<HTMLDivElement>(null);

    const undo = useCallback(
        () => dispatch(explorerHistoryActions.undo()),
        [dispatch],
    );
    const redo = useCallback(
        () => dispatch(explorerHistoryActions.redo()),
        [dispatch],
    );

    useWindowEvent('keydown', (event) => {
        const direction = travelDirection(event);
        if (
            !direction ||
            isTextEntry(event.target) ||
            isBehindModal(ref.current)
        )
            return;
        // The browser's own undo would rewrite an input the chart no longer matches
        event.preventDefault();
        if (direction === 'undo') undo();
        else redo();
    });

    return (
        <Group ref={ref} gap="xxs" wrap="nowrap">
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
ExplorerHistoryButtons.displayName = 'ExplorerHistoryButtons';
