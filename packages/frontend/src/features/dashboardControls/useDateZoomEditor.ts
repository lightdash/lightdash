import { type DateZoomConfig, type DateZoomControl } from '@lightdash/common';
import { createContext, useContextSelector } from 'use-context-selector';
import { type FieldApply } from './useControlsSidebar';

/** A tile card's pick: one of its date fields, or a tile with none that only reads the parameter. */
export type DateZoomTileChoice =
    | { kind: 'field'; fieldId: string }
    | { kind: 'parameter' };

export type DateZoomEditorValue = {
    /** The zoom in the popover, or null. */
    editingUuid: string | null;
    /** Started from "Add date zoom": not on the bar until Apply. */
    isNew: boolean;
    /** The edited zoom as the draft has it. */
    draft: DateZoomControl | null;
    /** Every zoom and tile target as Apply would write them. */
    draftConfig: DateZoomConfig | null;
    /** Another pill was clicked over unapplied changes: the popover asks to Apply or Discard first. */
    isAsking: boolean;
    /** A pill's click: opens; on the open one, closes a clean edit, else focuses Apply. */
    open: (uuid: string) => void;
    /** "Add date zoom": a new zoom, on the bar only once applied. */
    add: () => void;
    /** Writes the draft zoom (name, grain, hidden). */
    update: (next: DateZoomControl) => void;
    /** Writes the draft to the dashboard and ends the edit. */
    apply: () => void;
    /** Drops the draft; nothing reached the dashboard. */
    cancel: () => void;
    /** Applies (true) or discards (false), then opens what was clicked. */
    resolvePending: (isApply: boolean) => void;
    /** Takes the zoom off the dashboard at once and ends the edit. */
    remove: () => void;
    /** Choosing the zoom's tiles: the mapping row stands in for the popover. */
    isMapping: boolean;
    /** The last change in mapping, while Undo can take it back. */
    mappingUndo: FieldApply | null;
    /** "Choose tiles": the popover gives way to the mapping row. */
    startMapping: () => void;
    /** The back arrow: the popover again, tile choices kept in the draft. */
    endMapping: () => void;
    /** Tile choices back to where mapping started, then the popover. */
    cancelMapping: () => void;
    /** A tile card's pick; a tile in another zoom moves to this one. */
    setTile: (tileUuid: string, choice: DateZoomTileChoice | null) => void;
    /** The tiles bar: adds (each on its first date field) or clears tiles. */
    setTiles: (tileUuids: string[], isZoomed: boolean) => void;
    undoMapping: () => void;
};

export const DateZoomEditorContext = createContext<DateZoomEditorValue | null>(
    null,
);

const noop = () => {};
// Outside the provider (an embed's bar): nothing edits
const NO_EDITOR: DateZoomEditorValue = {
    editingUuid: null,
    isNew: false,
    draft: null,
    draftConfig: null,
    isAsking: false,
    open: noop,
    add: noop,
    update: noop,
    apply: noop,
    cancel: noop,
    resolvePending: noop,
    remove: noop,
    isMapping: false,
    mappingUndo: null,
    startMapping: noop,
    endMapping: noop,
    cancelMapping: noop,
    setTile: noop,
    setTiles: noop,
    undoMapping: noop,
};

/** Callbacks are stable; select a slice so a pill re-renders only for its own. */
export const useDateZoomEditorSelector = <Selected>(
    selector: (value: DateZoomEditorValue) => Selected,
): Selected =>
    useContextSelector(DateZoomEditorContext, (context) =>
        selector(context ?? NO_EDITOR),
    );
