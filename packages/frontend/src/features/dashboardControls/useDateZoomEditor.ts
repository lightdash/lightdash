import { type DateZoomControl } from '@lightdash/common';
import { createContext, useContextSelector } from 'use-context-selector';
import { type DateZoomTileTargets } from './dateZoomControls';

export type DateZoomEditorValue = {
    /** The zoom in the popover, or null. */
    editingId: string | null;
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
    /** Edit mode: the pill's X takes the zoom off the bar. */
    remove: (id: string) => void;
};

export const DateZoomEditorContext = createContext<DateZoomEditorValue | null>(
    null,
);

const noop = () => {};
// Outside the provider (a bar rendered on its own): nothing edits
const NO_EDITOR: DateZoomEditorValue = {
    editingId: null,
    draft: null,
    newZoom: null,
    draftTargets: null,
    isViewer: true,
    pick: null,
    isAsking: false,
    open: noop,
    add: noop,
    update: noop,
    setPick: noop,
    apply: noop,
    cancel: noop,
    resolvePending: noop,
    setSection: noop,
    remove: noop,
};

/** Callbacks are stable; select a slice so a pill re-renders only for its own. */
export const useDateZoomEditorSelector = <Selected>(
    selector: (value: DateZoomEditorValue) => Selected,
): Selected =>
    useContextSelector(DateZoomEditorContext, (context) =>
        selector(context ?? NO_EDITOR),
    );
