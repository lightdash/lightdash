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
    PARAMETER_PILL_ACTION_SELECTOR,
    PARAMETER_PILL_ATTRIBUTE,
    PARAMETER_PILL_SELECTOR,
    withControlSection,
    type ParameterControlDropTarget,
} from './parameterControlsBar';
import {
    clearControlFromTiles,
    setParameterControlTiles,
    setParameterKeyTiles,
    type ParameterTileChange,
} from './parameterPeers';
import { type FieldApply } from './useControlsSidebar';
import { useEditorDismiss } from './useEditorDismiss';
import { type ParameterBarEntry } from './useParameterBarControls';
import {
    ParameterEditorContext,
    useParameterEditorSelector,
    type NewParameterControl,
    type ParameterEditorValue,
} from './useParameterEditor';
import { useParameterMappingModel } from './useParameterMapping';

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
    draftControls: DashboardParameterControl[] | null;
    snapshotControls: DashboardParameterControl[] | null;
    mapping: {
        start: DashboardParameterControl[];
        selectedKey: string | null;
        hoveredKey: string | null;
        undo: {
            controls: DashboardParameterControl[];
            change: FieldApply;
        } | null;
    } | null;
};

// The section is no edit: it moves on the dashboard at once, as a filter's
const withoutSection = (control: DashboardParameterControl) =>
    withControlSection(control, null);

const isDirty = ({
    snapshot,
    draft,
    draftControls,
    snapshotControls,
}: EditState) =>
    !isEqual(withoutSection(snapshot), withoutSection(draft)) ||
    (draftControls !== null && !isEqual(draftControls, snapshotControls));

const NO_KEYS: string[] = [];

const findPill = (id: string) =>
    document.querySelector<HTMLElement>(
        `[${PARAMETER_PILL_ATTRIBUTE}="${id}"]`,
    );

type FocusTarget = { pillId: string; sectionId?: string };

// The pill and this reader update together after the editor closes.
const ParameterFocusReturn: FC<{
    target: RefObject<FocusTarget | null>;
}> = ({ target }) => {
    const isOpen = useParameterEditorSelector(
        (editor) => editor.editingId !== null,
    );
    useEffect(() => {
        const current = target.current;
        if (isOpen || current === null) return;
        target.current = null;
        const sectionAdd = current.sectionId
            ? document.querySelector<HTMLElement>(
                  `[data-section-add="${current.sectionId}"]`,
              )
            : null;
        (
            findPill(current.pillId) ??
            sectionAdd ??
            document.querySelector<HTMLElement>(ADD_SELECTOR)
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
    const focusReturn = useRef<FocusTarget | null>(null);
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
            draftControls: null,
            snapshotControls: null,
            mapping: null,
            snapshot: control,
            draft: control,
        });
    };

    const seedDraftControls = (current: EditState) => {
        if (current.draftControls !== null) return current;
        const list = store.getState().parameters.parameterControls;
        if (list === null) return null;
        const draftControls = current.isNew
            ? [...list, current.draft]
            : current.isNeedsValue
              ? addNeedsValueControl(list, current.draft, current.tileUuids)
              : list.map((item) =>
                    item.id === current.id ? current.draft : item,
                );
        return {
            ...current,
            draftControls,
            snapshotControls: draftControls,
        };
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
        if (
            current.draftControls !== null &&
            current.snapshotControls !== null
        ) {
            const id = current.isNeedsValue ? uuidv4() : draft.id;
            const mapped = current.draftControls.find(
                (item) => item.id === draft.id,
            );
            if (!mapped) return;
            writeControls((list) => {
                const merged = list.map((item) => {
                    const before = current.snapshotControls!.find(
                        (entry) => entry.id === item.id,
                    );
                    const after = current.draftControls!.find(
                        (entry) => entry.id === item.id,
                    );
                    if (!before || !after) return item;
                    const parameters = { ...item.parameters };
                    for (const key of new Set([
                        ...Object.keys(before.parameters),
                        ...Object.keys(after.parameters),
                    ])) {
                        if (
                            isEqual(
                                before.parameters[key],
                                after.parameters[key],
                            )
                        )
                            continue;
                        if (after.parameters[key] === undefined)
                            delete parameters[key];
                        else parameters[key] = after.parameters[key];
                    }
                    if (item.id === draft.id)
                        return withControlSection(
                            { ...draft, parameters },
                            item.sectionId ?? null,
                        );
                    return { ...item, parameters };
                });
                return current.isNew || current.isNeedsValue
                    ? [
                          ...merged,
                          { ...draft, id, parameters: mapped.parameters },
                      ]
                    : merged;
            });
            end(id);
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
        if (latest.current?.mapping) {
            if (
                isEqual(
                    latest.current.mapping.start,
                    latest.current.draftControls,
                )
            )
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

    const startMapping = useStableCallback(() => {
        const current = latest.current;
        if (!current || current.isViewer) return;
        const seeded = seedDraftControls(current);
        if (!seeded || !seeded.draftControls) return;
        setState({
            ...seeded,
            mapping: {
                start: seeded.draftControls,
                selectedKey: null,
                hoveredKey: null,
                undo: null,
            },
        });
    });
    const endMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping) setState({ ...current, mapping: null });
    });
    const cancelMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping)
            setState({
                ...current,
                draftControls: current.mapping.start,
                mapping: null,
            });
    });
    const changeMapping = (
        next: DashboardParameterControl[],
        fieldId: string,
        kind: 'clear' | 'apply',
        tileCount: number,
    ) => {
        const current = latest.current;
        if (
            !current?.mapping ||
            !current.draftControls ||
            next === current.draftControls
        )
            return;
        setState({
            ...current,
            draftControls: next,
            mapping: {
                ...current.mapping,
                undo: {
                    controls: current.draftControls,
                    change: {
                        kind,
                        fieldId,
                        tileCount,
                        replaced: 0,
                        acrossTabs: true,
                    },
                },
            },
        });
    };
    const setTiles = useStableCallback((changes: ParameterTileChange[]) => {
        const current = latest.current;
        if (!current?.mapping || !current.draftControls) return;
        const { tileParameterReferences, parameterDefinitions } =
            store.getState().parameters;
        const next = setParameterControlTiles({
            controls: current.draftControls,
            controlId: current.id,
            changes,
            tileParameterReferences,
            definitions: parameterDefinitions,
            userParameterNames: Object.keys(parameterDefinitions),
        });
        changeMapping(
            next,
            current.mapping.selectedKey ??
                changes.find(({ key }) => key !== null)?.key ??
                '',
            changes.every(({ key }) => key === null) ? 'clear' : 'apply',
            new Set(changes.map(({ tileUuid }) => tileUuid)).size,
        );
    });
    const setKeyTiles = useStableCallback(
        (key: string, tileUuids: string[], included: boolean) => {
            const current = latest.current;
            if (!current?.mapping || !current.draftControls) return;
            const { tileParameterReferences, parameterDefinitions } =
                store.getState().parameters;
            const next = setParameterKeyTiles({
                controls: current.draftControls,
                controlId: current.id,
                key,
                tileUuids,
                tileParameterReferences,
                included,
                userParameterNames: Object.keys(parameterDefinitions),
            });
            changeMapping(
                next,
                key,
                included ? 'apply' : 'clear',
                tileUuids.length,
            );
        },
    );
    const clearAllTiles = useStableCallback((tileUuids: string[]) => {
        const current = latest.current;
        if (!current?.mapping || !current.draftControls) return;
        changeMapping(
            clearControlFromTiles({
                controls: current.draftControls,
                controlId: current.id,
                tileUuids,
            }),
            current.mapping.selectedKey ?? '',
            'clear',
            tileUuids.length,
        );
    });
    const undoMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping?.undo)
            setState({
                ...current,
                draftControls: current.mapping.undo.controls,
                mapping: { ...current.mapping, undo: null },
            });
    });
    const selectKey = useStableCallback((key: string | null) => {
        const current = latest.current;
        if (current?.mapping)
            setState({
                ...current,
                mapping: { ...current.mapping, selectedKey: key },
            });
    });
    const hoverKey = useStableCallback((key: string | null) => {
        const current = latest.current;
        if (current?.mapping && current.mapping.hoveredKey !== key)
            setState({
                ...current,
                mapping: { ...current.mapping, hoveredKey: key },
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

    const dismissOutside = useStableCallback(() => {
        if (!latest.current?.mapping) cancel();
    });
    const clearKey = useStableCallback(() => selectKey(null));

    useEditorDismiss({
        isOpen: edit !== null,
        isFieldClicked: (edit?.mapping?.selectedKey ?? null) !== null,
        isAsking,
        isPristineNew: false,
        clearField: clearKey,
        dismiss,
        dismissOutside,
        pillSelector: `${PARAMETER_PILL_SELECTOR}, ${PARAMETER_PILL_ACTION_SELECTOR}, ${FILTER_TARGET_SELECTOR}`,
    });

    const mapping = useParameterMappingModel({
        isMapping: edit?.mapping != null,
        draft: edit?.draft ?? null,
        draftControls: edit?.draftControls ?? null,
        openedKeys: edit?.parameterKeys ?? NO_KEYS,
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
            draftControls: edit?.draftControls ?? null,
            isMapping: edit?.mapping != null,
            selectedKey: edit?.mapping?.selectedKey ?? null,
            hoveredKey: edit?.mapping?.hoveredKey ?? null,
            mappingUndo: edit?.mapping?.undo?.change ?? null,
            startMapping,
            endMapping,
            cancelMapping,
            setTiles,
            setKeyTiles,
            clearAllTiles,
            undoMapping,
            selectKey,
            hoverKey,
            mapping,
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
            startMapping,
            endMapping,
            cancelMapping,
            setTiles,
            setKeyTiles,
            clearAllTiles,
            undoMapping,
            selectKey,
            hoverKey,
            mapping,
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
