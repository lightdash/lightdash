import { type DateZoomControl } from '@lightdash/common';
import { createContext, useContextSelector } from 'use-context-selector';
import {
    type DateZoomMapping,
    type DateZoomTileTargets,
    type ZoomTileChange,
} from './dateZoomControls';
import { type FieldApply } from './useControlsSidebar';

export type DateZoomEditorValue = {
    /** The zoom in the popover, or null. */
    editingId: string | null;
    /** The default zoom is in the popover: never told apart by `editingId`. */
    isEditingDefault: boolean;
    /** Its draft: only Apply takes it to the dashboard. */
    draft: DateZoomControl | null;
    /** A zoom started from "Add", as it opened: a draft pill until Apply puts it on the bar. */
    newZoom: DateZoomControl | null;
    /** Every tile target as the draft would leave them. */
    draftTargets: DateZoomTileTargets | null;
    /** Outside edit mode: Apply picks the grain, nothing is saved. */
    isViewer: boolean;
    /** A viewer's pick in the popover; null: the saved grain. */
    pick: string | null;
    /** Another pill was clicked over unapplied changes: the popover asks to Apply or Discard first. */
    isAsking: boolean;
    /** A pill's click: opens; on the open one, closes a clean edit, else focuses Apply. */
    open: (control: DateZoomControl) => void;
    /** The Default zoom button's click, as `open`. */
    openDefault: () => void;
    /** Edit mode: a new zoom in the popover, in the section (null: none); Apply adds it. */
    add: (sectionId: string | null) => void;
    /** Writes the draft; a section change reaches the dashboard at once. */
    update: (next: DateZoomControl) => void;
    setPick: (granularity: string | null) => void;
    apply: () => void;
    /** Drops the draft; nothing reached the dashboard. */
    cancel: () => void;
    /** Applies (true) or discards (false), then opens what was clicked. */
    resolvePending: (isApply: boolean) => void;
    /** Edit mode: a drag, a keyboard move or the selection bar, on the dashboard at once. */
    setSection: (id: string, sectionId: string | null) => void;
    /** Edit mode: Alt with an arrow on a bar without sections, to the other's place. */
    move: (id: string, overId: string) => void;
    /** Edit mode: the pill's X takes the zoom off the bar. */
    remove: (id: string) => void;
    /** Choosing the draft's tiles: the mapping row stands in for the popover. */
    isMapping: boolean;
    /** What mapping shows, computed once; null while not mapping. */
    mapping: DateZoomMapping | null;
    /** The last change in mapping, while Undo can take it back. */
    mappingUndo: FieldApply | null;
    /** "Choose tiles": the popover gives way to the mapping row. */
    startMapping: () => void;
    /** The back arrow: the popover again, tile choices kept in the draft. */
    endMapping: () => void;
    /** Tile choices back to where mapping started, then the popover. */
    cancelMapping: () => void;
    /** Puts the draft on (or takes it off) tiles; Undo can take it back. */
    setTiles: (changes: ZoomTileChange[], kind: FieldApply['kind']) => void;
    undoMapping: () => void;
};

export const DateZoomEditorContext = createContext<DateZoomEditorValue | null>(
    null,
);

const noop = () => {};
// Outside the provider (a bar rendered on its own): nothing edits
const NO_EDITOR: DateZoomEditorValue = {
    editingId: null,
    isEditingDefault: false,
    draft: null,
    newZoom: null,
    draftTargets: null,
    isViewer: true,
    pick: null,
    isAsking: false,
    open: noop,
    openDefault: noop,
    add: noop,
    update: noop,
    setPick: noop,
    apply: noop,
    cancel: noop,
    resolvePending: noop,
    setSection: noop,
    move: noop,
    remove: noop,
    isMapping: false,
    mapping: null,
    mappingUndo: null,
    startMapping: noop,
    endMapping: noop,
    cancelMapping: noop,
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
