import { isEqual } from 'es-toolkit/compat';
import {
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useStableCallback } from '../../hooks/useStableCallback';
import {
    ADD_SELECTOR,
    getOtherPillsSelector,
    PILL_SELECTORS,
    type ControlKind,
} from './controlKinds';
import { type FocusTarget } from './EditorFocusReturn';
import { type FieldApply } from './useControlsSidebar';
import { useEditorDismiss } from './useEditorDismiss';

const APPLY_SELECTOR = '[data-controls-editor] [data-controls-apply]';
const focusApply = () =>
    document.querySelector<HTMLElement>(APPLY_SELECTOR)?.focus();

/** A parameter's or a date zoom's edit: the state both editors hold. */
export type EditSession<M> = {
    id: string;
    // Started from "Add": not on the bar until Apply
    isNew: boolean;
    // The mode it started in: a mode change ends it, as Cancel
    isViewer: boolean;
    snapshot: { sectionId?: string };
    mapping: {
        start: M;
        undo: { draft: M; change: FieldApply } | null;
    } | null;
};

type Args<S extends EditSession<M>, M> = {
    kind: Exclude<ControlKind, 'filter'>;
    isViewer: boolean;
    /** As set; `edit` is what is still open (derived by the kind). */
    state: S | null;
    edit: S | null;
    setState: Dispatch<SetStateAction<S | null>>;
    isDirty: (edit: S) => boolean;
    /** Writes the edit; returns the pill to focus, or null to stay open. */
    applyEdit: (edit: S) => string | null;
    /** The draft mapping edits. */
    getMappingDraft: (edit: S) => M | null;
    withMappingDraft: (edit: S, draft: M) => S;
    isFieldClicked: boolean;
    clearField: () => void;
};

// One parameter or date zoom edited at a time, beside the filter editor:
// the pending question, Apply, Cancel, Escape, a press outside, a click on
// another kind's pill, a mode change and focus return follow its rules
export const useEditorSession = <S extends EditSession<M>, M>({
    kind,
    isViewer,
    state,
    edit,
    setState,
    isDirty,
    applyEdit,
    getMappingDraft,
    withMappingDraft,
    isFieldClicked,
    clearField,
}: Args<S, M>) => {
    // What follows once "Apply changes first?" is answered
    const [pending, setPending] = useState<{ proceed: () => void } | null>(
        null,
    );
    const isAsking = edit !== null && pending !== null;
    const latest = useRef(edit);
    latest.current = edit;
    const latestPending = useRef(pending);
    latestPending.current = isAsking ? pending : null;
    // The pill that takes focus once the popover has gone, else "Add"
    const focusReturn = useRef<FocusTarget | null>(null);

    const end = useStableCallback((focusId: string | null) => {
        const current = latest.current;
        focusReturn.current =
            focusId === null
                ? null
                : {
                      pillId: focusId,
                      sectionId: current?.isNew
                          ? current.snapshot.sectionId
                          : undefined,
                  };
        latest.current = null;
        latestPending.current = null;
        setState(null);
        setPending(null);
    });
    const begin = (next: S) => {
        setPending(null);
        setState(next);
    };

    const cancel = useStableCallback(() => {
        const current = latest.current;
        if (current !== null) end(current.id);
    });

    const apply = useStableCallback(() => {
        const current = latest.current;
        if (current === null) return;
        const focusId = applyEdit(current);
        if (focusId !== null) end(focusId);
    });

    /** Asks "Apply changes first?"; `proceed` runs once it is answered. */
    const ask = (proceed: () => void) => {
        setPending({ proceed });
        focusApply();
    };

    // The same pill toggles; another one switches when clean, else the
    // popover asks
    const open = useStableCallback((id: string, start: () => void) => {
        const current = latest.current;
        if (current?.id === id) {
            if (isDirty(current)) focusApply();
            else cancel();
            return;
        }
        if (current !== null && isDirty(current)) {
            ask(start);
            return;
        }
        start();
    });

    // The prompt's answer: Apply or Discard, then what was clicked. The
    // next editor takes focus, not this pill
    const resolvePending = useStableCallback((isApply: boolean) => {
        const next = latestPending.current;
        if (next === null) return;
        if (isApply) apply();
        else cancel();
        focusReturn.current = null;
        next.proceed();
    });

    const endMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping) setState({ ...current, mapping: null });
    });
    const cancelMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping)
            setState(
                withMappingDraft(
                    { ...current, mapping: null },
                    current.mapping.start,
                ),
            );
    });
    const undoMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping?.undo)
            setState(
                withMappingDraft(
                    { ...current, mapping: { ...current.mapping, undo: null } },
                    current.mapping.undo.draft,
                ),
            );
    });
    /** A mapping step, undoable once. */
    const changeMapping = (next: M, change: FieldApply) => {
        const current = latest.current;
        const draft = current === null ? null : getMappingDraft(current);
        if (!current?.mapping || draft === null || next === draft) return;
        setState(
            withMappingDraft(
                {
                    ...current,
                    mapping: {
                        ...current.mapping,
                        undo: { draft, change },
                    },
                },
                next,
            ),
        );
    };

    // Escape: in mapping, back to the popover while nothing changed there;
    // else a question is withdrawn, else the edit is cancelled
    const dismiss = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping) {
            if (isEqual(current.mapping.start, getMappingDraft(current)))
                endMapping();
            return;
        }
        if (latestPending.current === null) {
            cancel();
            return;
        }
        setPending(null);
        setTimeout(() =>
            document
                .querySelector<HTMLElement>('[data-controls-editor] input')
                ?.focus(),
        );
    });

    // Another kind's pill, its X or "Add" while this one is edited: a clean edit
    // closes and the click goes on; with unapplied changes the popover asks,
    // and the click is replayed once it is answered
    const otherTargetSelector = `${getOtherPillsSelector(kind)}, ${ADD_SELECTOR}`;
    const isOpenForCapture = edit !== null;
    useEffect(() => {
        if (!isOpenForCapture) return undefined;
        const handleClick = (event: MouseEvent) => {
            const current = latest.current;
            if (current === null || !(event.target instanceof Element)) return;
            const target =
                event.target.closest<HTMLElement>(otherTargetSelector);
            if (target === null) return;
            // What was clicked inside the pill (its X), not the pill itself
            const clicked = event.target.closest<HTMLElement>('button');
            if (!isDirty(current)) {
                cancel();
                focusReturn.current = null;
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const replayed =
                clicked !== null && target.contains(clicked) ? clicked : target;
            setPending({ proceed: () => replayed.click() });
            focusApply();
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [isOpenForCapture, cancel, isDirty, otherTargetSelector]);

    const remove = (id: string, write: () => void) => {
        if (latest.current?.id === id) setState(null);
        focusReturn.current = null;
        write();
        setTimeout(() =>
            document.querySelector<HTMLElement>(ADD_SELECTOR)?.focus(),
        );
    };

    // A mode change ends the edit it started in, as the filter editor's:
    // an editor's is applied, a viewer's dropped.
    // The one effect that writes the store
    const unsettled = useRef(state);
    unsettled.current = state;
    const lastIsViewer = useRef(isViewer);
    useEffect(() => {
        if (lastIsViewer.current === isViewer) return;
        lastIsViewer.current = isViewer;
        const previous = unsettled.current;
        if (previous === null) return;
        if (!previous.isViewer) {
            latest.current = previous;
            latestPending.current = null;
            apply();
        }
        end(null);
    }, [isViewer, apply, end]);

    // Mapping is left only by its own Cancel or Apply
    const dismissOutside = useStableCallback(() => {
        if (!latest.current?.mapping) cancel();
    });

    const { pill, action } = PILL_SELECTORS[kind];
    useEditorDismiss({
        isOpen: edit !== null,
        isFieldClicked,
        isAsking,
        isPristineNew: false,
        clearField,
        dismiss,
        dismissOutside,
        pillSelector: `${pill}, ${action}, ${otherTargetSelector}`,
    });

    return {
        latest,
        focusReturn,
        isAsking,
        ask,
        begin,
        end,
        cancel,
        apply,
        open,
        resolvePending,
        endMapping,
        cancelMapping,
        undoMapping,
        changeMapping,
        remove,
    };
};
