import { type DashboardParameterControl } from '@lightdash/common';
import { createContext, useContextSelector } from 'use-context-selector';
import { type ParameterControlDropTarget } from './parameterControlsBar';
import { type ParameterBarEntry } from './useParameterBarControls';

export type ParameterEditorValue = {
    /** The control in the popover, or null. */
    editingId: string | null;
    /** Its draft: only Apply takes it to the dashboard. */
    draft: DashboardParameterControl | null;
    /** A "needs a value" pill: its Apply adds the control (editors) or picks the value (viewers). */
    isNeedsValue: boolean;
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
    isViewer: true,
    isAsking: false,
    open: noop,
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
