import { type DashboardParameterControl } from '@lightdash/common';
import { createContext, useContextSelector } from 'use-context-selector';
import { type ParameterControlDropTarget } from './parameterControlsBar';
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
    /** Edit mode: opens a control that is not on the bar yet; Apply adds it with its bindings, Cancel drops it. */
    add: (entry: NewParameterControl) => void;
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
};

/** Callbacks are stable; select a slice so a pill re-renders only for its own. */
export const useParameterEditorSelector = <Selected>(
    selector: (value: ParameterEditorValue) => Selected,
): Selected =>
    useContextSelector(ParameterEditorContext, (context) =>
        selector(context ?? NO_EDITOR),
    );
