import {
    getControlledKeys,
    type DashboardParameterControl,
} from '@lightdash/common';
import { VisuallyHidden } from '@mantine/core';
import { isEqual } from 'es-toolkit/compat';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
    type RefObject,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStableCallback } from '../../hooks/useStableCallback';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    dashboardParametersActions,
    selectControlSections,
    selectParameterControls,
    useDashboardDispatch,
    useDashboardSelector,
    useDashboardStore,
} from '../dashboard/store';
import { ParameterBarProvider } from './ParameterBarProvider';
import {
    addNeedsValueControl,
    moveParameterControl,
    PARAMETER_PILL_ATTRIBUTE,
    PARAMETER_PILL_SELECTOR,
    withControlSection,
    type ParameterControlDropTarget,
} from './parameterControlsBar';
import { useEditorDismiss } from './useEditorDismiss';
import { type ParameterBarEntry } from './useParameterBarControls';
import {
    ParameterEditorContext,
    useParameterEditorSelector,
    type NewParameterControl,
    type ParameterEditorValue,
} from './useParameterEditor';

// What switches away from an open control: another control's pill, a
// filter's pill or "Add filter"
const FILTER_TARGET_SELECTOR =
    '[data-controls-pill], [data-filter-actions] > button[data-dashboard-filter-control]';
const APPLY_SELECTOR = '[data-controls-editor] [data-controls-apply]';
const focusApply = () =>
    document.querySelector<HTMLElement>(APPLY_SELECTOR)?.focus();

const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';

type OpenedEntry = Pick<
    ParameterBarEntry,
    'control' | 'isNeedsValue' | 'parameterKeys' | 'tileUuids'
>;

type EditState = {
    id: string;
    isNeedsValue: boolean;
    // Started from "Add": not on the bar until Apply
    isNew: boolean;
    /** Its keys and tiles as opened: a "needs a value" or new control's are the ones Apply sets. */
    parameterKeys: string[];
    tileUuids: string[];
    // The mode it started in: a mode change ends it, as Cancel
    isViewer: boolean;
    snapshot: DashboardParameterControl;
    draft: DashboardParameterControl;
};

// The section is no edit: it moves on the dashboard at once, as a filter's
const withoutSection = (control: DashboardParameterControl) =>
    withControlSection(control, null);

const isDirty = ({ snapshot, draft }: EditState) =>
    !isEqual(withoutSection(snapshot), withoutSection(draft));

const findPill = (id: string) =>
    document.querySelector<HTMLElement>(
        `[${PARAMETER_PILL_ATTRIBUTE}="${id}"]`,
    );

// The pill and this reader update together after the editor closes.
const ParameterFocusReturn: FC<{ target: RefObject<string | null> }> = ({
    target,
}) => {
    const isOpen = useParameterEditorSelector(
        (editor) => editor.editingId !== null,
    );
    useEffect(() => {
        const id = target.current;
        if (isOpen || id === null) return;
        target.current = null;
        (
            findPill(id) ?? document.querySelector<HTMLElement>(ADD_SELECTOR)
        )?.focus();
    }, [isOpen, target]);
    return null;
};

// One parameter control edited at a time, beside the filter editor: the
// draft, Apply, Cancel, Escape, a press outside and focus return follow the
// filter editor's rules. This is the only writer of parameter controls
export const ParameterEditorProvider: FC<{
    isViewer: boolean;
    children: ReactNode;
}> = ({ isViewer, children }) => {
    const store = useDashboardStore();
    const dispatch = useDashboardDispatch();
    const setParameter = useDashboardContext((c) => c.setParameter);
    const controls = useDashboardSelector(selectParameterControls);
    const [state, setState] = useState<EditState | null>(null);
    // Derived: a mode change, or the control leaving the dashboard, ends the edit
    const edit =
        state !== null &&
        state.isViewer === isViewer &&
        (state.isNeedsValue ||
            state.isNew ||
            (controls ?? []).some(({ id }) => id === state.id))
            ? state
            : null;
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
    const focusReturn = useRef<string | null>(null);
    const [announcement, setAnnouncement] = useState({ text: '', count: 0 });

    const writeControls = (
        write: (
            current: DashboardParameterControl[],
        ) => DashboardParameterControl[],
    ) => {
        const current = store.getState().parameters.parameterControls;
        if (current === null) return;
        const next = write(current);
        if (next !== current)
            dispatch(dashboardParametersActions.setParameterControls(next));
    };
    const end = (focusId: string | null) => {
        focusReturn.current = focusId;
        latest.current = null;
        latestPending.current = null;
        setState(null);
        setPending(null);
    };
    const start = (
        { control, isNeedsValue, parameterKeys, tileUuids }: OpenedEntry,
        isNew = false,
    ) => {
        setPending(null);
        setState({
            id: control.id,
            isNeedsValue,
            isNew,
            parameterKeys,
            tileUuids,
            isViewer,
            snapshot: control,
            draft: control,
        });
    };

    const cancel = useStableCallback(() => {
        const current = latest.current;
        if (current === null) return;
        end(current.id);
    });

    const apply = useStableCallback(() => {
        const current = latest.current;
        if (current === null) return;
        const { draft } = current;
        const saved = store.getState().parameters.parameterControls;
        if (!current.isViewer && saved === null) return;
        const [needsValueKey] = current.parameterKeys;
        if (current.isViewer) {
            if (!isDirty(current)) {
                end(current.id);
                return;
            }
            if (
                current.isNeedsValue &&
                getControlledKeys(saved ?? []).has(needsValueKey)
            ) {
                // Beside a control on the key: only the tiles it leaves out
                dispatch(
                    dashboardParametersActions.setParameterTilePicks({
                        key: needsValueKey,
                        value: draft.value,
                        tileUuids: current.tileUuids,
                    }),
                );
            } else if (current.isNeedsValue) {
                current.parameterKeys.forEach((key) =>
                    setParameter(key, draft.value),
                );
            } else {
                dispatch(
                    dashboardParametersActions.setParameterControlPick({
                        id: draft.id,
                        value: draft.value,
                    }),
                );
            }
            end(current.id);
            return;
        }
        if (current.isNeedsValue) {
            const added = { ...draft, id: uuidv4() };
            writeControls((list) =>
                addNeedsValueControl(list, added, current.tileUuids),
            );
            end(added.id);
            return;
        }
        if (current.isNew) {
            writeControls((list) => [...list, draft]);
            end(draft.id);
            return;
        }
        if (isDirty(current))
            writeControls((list) =>
                list.map((control) =>
                    control.id === draft.id
                        ? // Its section as the dashboard has it
                          withControlSection(draft, control.sectionId ?? null)
                        : control,
                ),
            );
        end(current.id);
    });

    const open = useStableCallback((entry: OpenedEntry) => {
        const current = latest.current;
        if (current?.id === entry.control.id) {
            if (isDirty(current)) {
                focusApply();
                return;
            }
            cancel();
            return;
        }
        // Another control: a clean edit switches, else the popover asks
        if (current !== null && isDirty(current)) {
            setPending({ proceed: () => start(entry) });
            focusApply();
            return;
        }
        start(entry);
    });

    const add = useStableCallback((entry: NewParameterControl) =>
        start({ ...entry, isNeedsValue: false }, true),
    );

    // The prompt's answer: Apply or Discard, then what was clicked. The
    // next editor takes focus, not this control's pill
    const resolvePending = useStableCallback((isApply: boolean) => {
        const next = latestPending.current;
        if (next === null) return;
        if (isApply) apply();
        else cancel();
        focusReturn.current = null;
        next.proceed();
    });

    // Escape: a question is withdrawn, else the edit is cancelled
    const dismiss = useStableCallback(() => {
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

    // A filter's pill or "Add filter" while a control is edited: a clean edit
    // closes and the click goes on; with unapplied changes the popover asks,
    // and the click is replayed once it is answered
    const isOpenForCapture = edit !== null;
    useEffect(() => {
        if (!isOpenForCapture) return undefined;
        const handleClick = (event: MouseEvent) => {
            const current = latest.current;
            const target =
                event.target instanceof Element
                    ? event.target.closest<HTMLElement>(FILTER_TARGET_SELECTOR)
                    : null;
            if (current === null || target === null) return;
            if (!isDirty(current)) {
                cancel();
                focusReturn.current = null;
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            setPending({ proceed: () => target.click() });
            focusApply();
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [isOpenForCapture, cancel]);

    const update = useStableCallback((next: DashboardParameterControl) => {
        const current = latest.current;
        if (current === null) return;
        const sectionId = next.sectionId ?? null;
        const isSectionMove =
            !current.isViewer &&
            !current.isNeedsValue &&
            !current.isNew &&
            sectionId !== (current.draft.sectionId ?? null);
        if (isSectionMove)
            writeControls((list) =>
                list.map((control) =>
                    control.id === current.id
                        ? withControlSection(control, sectionId)
                        : control,
                ),
            );
        setState({
            ...current,
            draft: next,
            snapshot: isSectionMove
                ? withControlSection(current.snapshot, sectionId)
                : current.snapshot,
        });
    });

    const move = useStableCallback(
        (activeId: string, target: ParameterControlDropTarget) => {
            const sections = selectControlSections(store.getState());
            const list = store.getState().parameters.parameterControls;
            if (list === null) return;
            const moved = moveParameterControl(
                list,
                activeId,
                target,
                sections,
            );
            if (moved === list) return;
            const pill = findPill(activeId);
            const hadFocus = pill !== null && document.activeElement === pill;
            dispatch(dashboardParametersActions.setParameterControls(moved));
            if ('controlId' in target) {
                const nameOf = (id: string) =>
                    findPill(id)?.dataset.parameterName ?? id;
                setAnnouncement(({ count }) => ({
                    text: `${nameOf(activeId)} moved ${
                        moved.findIndex(({ id }) => id === activeId) <
                        list.findIndex(({ id }) => id === activeId)
                            ? 'before'
                            : 'after'
                    } ${nameOf(target.controlId)}`,
                    count: count + 1,
                }));
            } else {
                const section = sections.find(
                    ({ id }) => id === target.sectionId,
                );
                setAnnouncement(({ count }) => ({
                    text: section
                        ? `Moved to section ${section.name}`
                        : 'Moved out of its section',
                    count: count + 1,
                }));
            }
            // Once the bar has redrawn: a moved node loses focus
            if (hadFocus) setTimeout(() => findPill(activeId)?.focus());
        },
    );

    const remove = useStableCallback((id: string) => {
        if (latest.current?.id === id) setState(null);
        focusReturn.current = null;
        dispatch(dashboardParametersActions.removeParameterControl(id));
        setTimeout(() =>
            document.querySelector<HTMLElement>(ADD_SELECTOR)?.focus(),
        );
    });

    // A mode change ends the edit it started in, as the filter editor's:
    // an editor's is applied, a viewer's (only picks) dropped.
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
    }, [isViewer, apply]);

    useEditorDismiss({
        isOpen: edit !== null,
        isFieldClicked: false,
        isAsking,
        isPristineNew: false,
        clearField: () => {},
        dismiss,
        dismissOutside: cancel,
        pillSelector: `${PARAMETER_PILL_SELECTOR}, ${FILTER_TARGET_SELECTOR}`,
    });

    const value = useMemo<ParameterEditorValue>(
        () => ({
            editingId: edit?.id ?? null,
            draft: edit?.draft ?? null,
            isNeedsValue: edit?.isNeedsValue ?? false,
            newControl: edit?.isNew
                ? {
                      control: edit.snapshot,
                      parameterKeys: edit.parameterKeys,
                      tileUuids: edit.tileUuids,
                  }
                : null,
            isViewer,
            isAsking,
            open,
            add,
            update,
            apply,
            cancel,
            resolvePending,
            move,
            remove,
        }),
        [
            edit,
            isViewer,
            isAsking,
            open,
            add,
            update,
            apply,
            cancel,
            resolvePending,
            move,
            remove,
        ],
    );

    return (
        <ParameterEditorContext.Provider value={value}>
            <ParameterBarProvider>{children}</ParameterBarProvider>
            <ParameterFocusReturn target={focusReturn} />
            {/* Moves happen with controls on (the flag), in edit mode */}
            {!isViewer && controls !== null && (
                // Not a second `status` role: the filter moves own that one
                <VisuallyHidden aria-live="polite">
                    <span key={announcement.count}>{announcement.text}</span>
                </VisuallyHidden>
            )}
        </ParameterEditorContext.Provider>
    );
};
