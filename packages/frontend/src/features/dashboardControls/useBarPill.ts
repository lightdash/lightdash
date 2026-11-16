import { useOs } from '@mantine/hooks';
import { type KeyboardEvent, type MouseEvent } from 'react';
import { type DashboardStoreState } from '../dashboard/store';
import { MOVE_KEYS, useBarMove, useBarSelection } from './barSelection';
import { usePillActionHover } from './usePillActionHover';
import { useTileHover } from './useTileHover';

type Args = {
    /** The control's id: its selection, move and hover marks. */
    id: string;
    /** The kind's pill button, so an action inside it is told apart. */
    pillSelector: string;
    /** An editor's pill with no control open: a modified click picks it. */
    canSelect: boolean;
    open: () => void;
    /** Alt with an arrow moves it (an editor's pill). */
    canMove: boolean;
    /** Off the sectioned bar: one place along the flat bar, else no move. */
    moveAlong: ((direction: 'left' | 'right') => void) | null;
    /** Marks its tiles while hovered. */
    isTileHoverEnabled: boolean;
    getTileUuids: (state: DashboardStoreState) => string[];
};

// A bar pill's shared behaviour, for filters, parameters and date zooms:
// on an editor's sectioned bar a modified click picks it and a plain one
// ends the selection before it opens; Alt with an arrow moves it; hover
// marks its tiles; an inner action's tooltip holds the pill's
export const useBarPill = ({
    id,
    pillSelector,
    canSelect,
    open,
    canMove,
    moveAlong,
    isTileHoverEnabled,
    getTileUuids,
}: Args) => {
    const selection = useBarSelection();
    const barMove = useBarMove();
    const os = useOs();
    const isSelectable = selection !== null && canSelect;
    const isPicked = isSelectable && selection.selectedIds.includes(id);
    const tileHover = useTileHover(id, isTileHoverEnabled, getTileUuids);
    const { isOnAction, trackAction } = usePillActionHover(pillSelector);

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (isSelectable) {
            if (event.metaKey || event.ctrlKey || event.shiftKey) {
                selection.pick(id, event.shiftKey);
                return;
            }
            selection.clear();
        }
        open();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const direction = MOVE_KEYS[event.key];
        if (!canMove || !event.altKey || direction === undefined) return;
        // On an editor's sectioned bar: along the bar or between lines
        if (barMove !== null) {
            event.preventDefault();
            barMove(id, direction);
            return;
        }
        if (moveAlong === null) return;
        if (direction !== 'left' && direction !== 'right') return;
        event.preventDefault();
        moveAlong(direction);
    };

    return {
        isSelectable,
        isPicked,
        selectHint: `Click to edit · ${os === 'macos' ? '⌘' : 'Ctrl'} click to select`,
        handleClick,
        handleKeyDown,
        tileHover,
        isOnAction,
        trackAction,
    };
};
