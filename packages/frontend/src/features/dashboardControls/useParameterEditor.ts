import { type DashboardParameterControl } from '@lightdash/common';
import { createContext, useContextSelector } from 'use-context-selector';
import { type ParameterControlDropTarget } from './parameterControlsBar';
import {
    type ParameterMapping,
    type ParameterTileChange,
} from './parameterPeers';
import { type FieldApply } from './useControlsSidebar';
import { type ParameterBarEntry } from './useParameterBarControls';

/** A control picked in "Add", with the key it sets and the tiles Apply binds it on. */
export type NewParameterControl = Pick<
    ParameterBarEntry,
    'control' | 'parameterKeys' | 'tileUuids'
>;

export type ParameterEditorValue = {
    /** The control in the popover, or null. */
    editingId: string | null;
    /** Its draft: only Apply takes it to the dashboard. */
    draft: DashboardParameterControl | null;
    /** A "needs a value" pill: its Apply adds the control (editors) or picks the value (viewers). */
    isNeedsValue: boolean;
    /** A control started from "Add", as it opened: a draft pill until Apply puts it on the bar. */
    newControl: NewParameterControl | null;
    /** Outside edit mode: Apply picks the value by key, nothing is saved. */
    isViewer: boolean;
    /** Another pill was clicked over unapplied changes: the popover asks to Apply or Discard first. */
    isAsking: boolean;
    /** A pill's click: opens; on the open one, closes a clean edit, else focuses Apply. */
    open: (
        entry: Pick<
            ParameterBarEntry,
            'control' | 'isNeedsValue' | 'parameterKeys' | 'tileUuids'
        >,
    ) => void;
    /** Edit mode: opens a control that is not on the bar yet; Apply adds it on its tiles, Cancel drops it. */
    add: (
        entry: NewParameterControl,
        options?: { chooseTiles?: boolean },
    ) => void;
    /** Writes the draft; a section change reaches the dashboard at once. */
    update: (next: DashboardParameterControl) => void;
    apply: () => void;
    /** Drops the draft; nothing reached the dashboard. */
    cancel: () => void;
    /** Applies (true) or discards (false), then opens what was clicked. */
    resolvePending: (isApply: boolean) => void;
    /** Edit mode: a drag or Alt+arrow, on the dashboard at once. */
    move: (activeId: string, target: ParameterControlDropTarget) => void;
    /** Edit mode: the pill's X takes the control off the bar. */
    remove: (id: string) => void;
    /** Every control as the draft would leave them, once tiles were chosen; null: the dashboard's. */
    draftControls: DashboardParameterControl[] | null;
    /** Choosing the tiles the draft sets: the mapping row stands in for the popover. */
    isMapping: boolean;
    /** The chip selected in mapping: the bulk bar acts on this key. */
    selectedKey: string | null;
    /** The chip hovered in mapping, as a filter's hovered field: its tiles ring over the selected one's. */
    hoveredKey: string | null;
    /** The last change in mapping, while Undo can take it back. */
    mappingUndo: FieldApply | null;
    /** "Choose tiles": the popover gives way to the mapping row. */
    startMapping: () => void;
    /** The back arrow: the popover again, tile choices kept in the draft. */
    endMapping: () => void;
    /** Tile choices back to where mapping started, then the popover. */
    cancelMapping: () => void;
    /** Sets (a key) or clears (null) tiles for the draft; Undo can take it back. */
    setTiles: (changes: ParameterTileChange[]) => void;
    setKeyTiles: (key: string, tileUuids: string[], included: boolean) => void;
    clearAllTiles: (tileUuids: string[]) => void;
    undoMapping: () => void;
    selectKey: (key: string | null) => void;
    hoverKey: (key: string | null) => void;
    /** What mapping shows (cards, counts, names), computed once; null while not mapping. */
    mapping: ParameterMapping | null;
};

export const ParameterEditorContext =
    createContext<ParameterEditorValue | null>(null);

const noop = () => {};
// Outside the provider (a bar rendered on its own): nothing edits
const NO_EDITOR: ParameterEditorValue = {
    editingId: null,
    draft: null,
    isNeedsValue: false,
    newControl: null,
    isViewer: true,
    isAsking: false,
    open: noop,
    add: noop,
    update: noop,
    apply: noop,
    cancel: noop,
    resolvePending: noop,
    move: noop,
    remove: noop,
    draftControls: null,
    isMapping: false,
    selectedKey: null,
    hoveredKey: null,
    mappingUndo: null,
    startMapping: noop,
    endMapping: noop,
    cancelMapping: noop,
    setTiles: noop,
    setKeyTiles: noop,
    clearAllTiles: noop,
    undoMapping: noop,
    selectKey: noop,
    hoverKey: noop,
    mapping: null,
};

/** Callbacks are stable; select a slice so a pill re-renders only for its own. */
export const useParameterEditorSelector = <Selected>(
    selector: (value: ParameterEditorValue) => Selected,
): Selected =>
    useContextSelector(ParameterEditorContext, (context) =>
        selector(context ?? NO_EDITOR),
    );
