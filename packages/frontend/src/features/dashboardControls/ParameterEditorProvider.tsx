import {
    getControlledKeys,
    type DashboardParameterControl,
} from '@lightdash/common';
import { VisuallyHidden } from '@mantine/core';
import { isEqual } from 'es-toolkit/compat';
import {
    useMemo,
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
import { EditorFocusReturn, type FocusTarget } from './EditorFocusReturn';
import { ParameterBarProvider } from './ParameterBarProvider';
import {
    addNeedsValueControl,
    moveParameterControl,
    PARAMETER_PILL_ATTRIBUTE,
    withControlSection,
    type ParameterControlDropTarget,
} from './parameterControlsBar';
import {
    clearControlFromTiles,
    setParameterControlTiles,
    setParameterKeyTiles,
    type ParameterTileChange,
} from './parameterPeers';
import { useOrderSectionChanges } from './useControlOrder';
import { useEditorSession, type EditSession } from './useEditorSession';
import { type ParameterBarEntry } from './useParameterBarControls';
import {
    ParameterEditorContext,
    useParameterEditorSelector,
    type NewParameterControl,
    type ParameterEditorValue,
} from './useParameterEditor';
import { useParameterMappingModel } from './useParameterMapping';

type OpenedEntry = Pick<
    ParameterBarEntry,
    'control' | 'isNeedsValue' | 'parameterKeys' | 'tileUuids'
>;

type EditState = EditSession<DashboardParameterControl[]> & {
    isNeedsValue: boolean;
    /** Its keys and tiles as opened: a "needs a value" or new control's are the ones Apply sets. */
    parameterKeys: string[];
    tileUuids: string[];
    snapshot: DashboardParameterControl;
    draft: DashboardParameterControl;
    draftControls: DashboardParameterControl[] | null;
    snapshotControls: DashboardParameterControl[] | null;
    mapping:
        | (NonNullable<EditSession<DashboardParameterControl[]>['mapping']> & {
              selectedKey: string | null;
              hoveredKey: string | null;
          })
        | null;
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

// A reader of the context, so it runs once the pills have updated
const ParameterFocusReturn: FC<{ target: RefObject<FocusTarget | null> }> = ({
    target,
}) => {
    const isOpen = useParameterEditorSelector((c) => c.editingId !== null);
    return (
        <EditorFocusReturn
            isOpen={isOpen}
            target={target}
            findPill={findPill}
        />
    );
};

// One parameter control edited at a time, beside the filter editor: the
// draft, Apply, Cancel, Escape, a press outside and focus return follow the
// filter editor's rules. This is the only writer of parameter controls
export const ParameterEditorProvider: FC<{
    isViewer: boolean;
    children: ReactNode;
}> = ({ isViewer, children }) => {
    const store = useDashboardStore();
    const orderSectionChanges = useOrderSectionChanges();
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
    const start = (
        { control, isNeedsValue, parameterKeys, tileUuids }: OpenedEntry,
        isNew = false,
    ) => {
        session.begin({
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

    const applyEdit = (current: EditState): string | null => {
        const { draft } = current;
        const saved = store.getState().parameters.parameterControls;
        if (!current.isViewer && saved === null) return null;
        const [needsValueKey] = current.parameterKeys;
        if (current.isViewer) {
            if (!isDirty(current)) return current.id;
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
            return current.id;
        }
        if (
            current.draftControls !== null &&
            current.snapshotControls !== null
        ) {
            const id = current.isNeedsValue ? uuidv4() : draft.id;
            const mapped = current.draftControls.find(
                (item) => item.id === draft.id,
            );
            if (!mapped) return null;
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
            return id;
        }
        if (current.isNeedsValue) {
            const added = { ...draft, id: uuidv4() };
            writeControls((list) =>
                addNeedsValueControl(list, added, current.tileUuids),
            );
            return added.id;
        }
        if (current.isNew) {
            writeControls((list) => [...list, draft]);
            return draft.id;
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
        return current.id;
    };

    const selectKey = useStableCallback((key: string | null) => {
        const current = latest.current;
        if (current?.mapping)
            setState({
                ...current,
                mapping: { ...current.mapping, selectedKey: key },
            });
    });
    const clearKey = useStableCallback(() => selectKey(null));

    const session = useEditorSession<EditState, DashboardParameterControl[]>({
        kind: 'parameter',
        isViewer,
        state,
        edit,
        setState,
        isDirty,
        applyEdit,
        getMappingDraft: (current) => current.draftControls,
        withMappingDraft: (current, draftControls) => ({
            ...current,
            draftControls,
        }),
        isFieldClicked: (edit?.mapping?.selectedKey ?? null) !== null,
        clearField: clearKey,
    });
    const { latest, isAsking, apply, cancel, resolvePending } = session;
    const { endMapping, cancelMapping, undoMapping } = session;

    const open = useStableCallback((entry: OpenedEntry) =>
        session.open(entry.control.id, () => start(entry)),
    );

    const add = useStableCallback((entry: NewParameterControl) =>
        start({ ...entry, isNeedsValue: false }, true),
    );

    const update = useStableCallback((next: DashboardParameterControl) => {
        const current = latest.current;
        if (current === null) return;
        const sectionId = next.sectionId ?? null;
        const isSectionMove =
            !current.isViewer &&
            !current.isNeedsValue &&
            !current.isNew &&
            sectionId !== (current.draft.sectionId ?? null);
        const before = store.getState();
        if (isSectionMove)
            writeControls((list) =>
                list.map((control) =>
                    control.id === current.id
                        ? withControlSection(control, sectionId)
                        : control,
                ),
            );
        // A section change is a reorder, written with it
        if (isSectionMove) orderSectionChanges(before);
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
    const changeMapping = (
        next: DashboardParameterControl[],
        fieldId: string,
        kind: 'clear' | 'apply',
        tileCount: number,
    ) =>
        session.changeMapping(next, {
            kind,
            fieldId,
            tileCount,
            replaced: 0,
            acrossTabs: true,
        });
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

    const remove = useStableCallback((id: string) =>
        session.remove(id, () =>
            dispatch(dashboardParametersActions.removeParameterControl(id)),
        ),
    );

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
            <ParameterFocusReturn target={session.focusReturn} />
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
