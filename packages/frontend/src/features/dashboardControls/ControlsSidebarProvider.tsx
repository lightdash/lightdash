import {
    createDashboardFilterRuleFromField,
    FilterOperator,
    isMetric,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameterControl,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type FC,
    type PropsWithChildren,
    type SetStateAction,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getLinkKey } from './linkCandidates';
import { getFilterFields } from './peers';
import {
    canKeepFilterRule,
    findFilterRule,
    isDefaultValueIncomplete,
    isFilterRuleDirty,
    PLACEHOLDER_TARGET,
    removeFilterRule,
    replaceFilterRule,
    type ControlsSidebarSnapshot,
} from './sidebarState';
import {
    ControlsSidebarContext,
    type ControlsSidebarContextValue,
    type ControlsSidebarSection,
} from './useControlsSidebar';

type SidebarState = {
    filterId: string;
    isNew: boolean;
    snapshot: ControlsSidebarSnapshot;
};

type ControlState = {
    controlId: string;
    isNew: boolean;
    snapshot: {
        parameterControls: DashboardParameterControl[];
        parameterValues: ParametersValuesMap;
    };
};

// What the callbacks read. Kept in a ref so their identity never changes, and
// written eagerly so two calls in one event (commit a label, then close) agree.
type Latest = {
    state: SidebarState | null;
    controlState: ControlState | null;
    placeholder: DashboardFilterRule | null;
    dashboardFilters: DashboardFilters;
    haveFiltersChanged: boolean;
    parameterControls: DashboardParameterControl[];
    parameterValues: ParametersValuesMap;
    filterableFieldsByTileUuid: DashboardContextType['filterableFieldsByTileUuid'];
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    setParameterControls: Dispatch<SetStateAction<DashboardParameterControl[]>>;
    setParameter: (key: string, value: ParameterValue | null) => void;
};

const getEditingRule = ({
    state,
    placeholder,
    dashboardFilters,
}: Pick<
    Latest,
    'state' | 'placeholder' | 'dashboardFilters'
>): DashboardFilterRule | null =>
    state === null
        ? null
        : (placeholder ?? findFilterRule(dashboardFilters, state.filterId));

const getEditingControl = ({
    controlState,
    parameterControls,
}: Pick<
    Latest,
    'controlState' | 'parameterControls'
>): DashboardParameterControl | null =>
    controlState === null
        ? null
        : (parameterControls.find(
              (control) => control.id === controlState.controlId,
          ) ?? null);

export const ControlsSidebarProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const parameterControls = useDashboardContext((c) => c.parameterControls);
    const setParameterControls = useDashboardContext(
        (c) => c.setParameterControls,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const savedTiles = useDashboardContext((c) => c.dashboard?.tiles);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const [dismissedLinks, setDismissedLinks] = useState<string[]>([]);

    const [state, setState] = useState<SidebarState | null>(null);
    const [controlState, setControlState] = useState<ControlState | null>(null);
    // Lives here, never in the dashboard filters, until it gets a mapping
    const [placeholder, setPlaceholder] = useState<DashboardFilterRule | null>(
        null,
    );
    const [activeSection, setActiveSection] =
        useState<ControlsSidebarSection>('fields');
    const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(
        null,
    );
    const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
    // Keyed by filter so a stale entry never leaks into another filter
    const [waiting, setWaiting] = useState<{
        filterId: string;
        fieldIds: string[];
    } | null>(null);

    const rendered: Latest = {
        state,
        controlState,
        placeholder,
        dashboardFilters,
        haveFiltersChanged,
        parameterControls,
        parameterValues,
        filterableFieldsByTileUuid,
        setDashboardFilters,
        setHaveFiltersChanged,
        setParameterControls,
        setParameter,
    };
    const latest = useRef(rendered);
    useLayoutEffect(() => {
        latest.current = rendered;
    });

    const writeFilters = useCallback(
        (update: (filters: DashboardFilters) => DashboardFilters) => {
            latest.current.dashboardFilters = update(
                latest.current.dashboardFilters,
            );
            latest.current.setDashboardFilters(update);
        },
        [],
    );

    const writeFiltersChanged = useCallback((changed: boolean) => {
        latest.current.haveFiltersChanged = changed;
        latest.current.setHaveFiltersChanged(changed);
    }, []);

    const writeControls = useCallback(
        (
            update: (
                controls: DashboardParameterControl[],
            ) => DashboardParameterControl[],
        ) => {
            latest.current.parameterControls = update(
                latest.current.parameterControls,
            );
            latest.current.setParameterControls(update);
        },
        [],
    );

    const writePlaceholder = useCallback((next: DashboardFilterRule | null) => {
        latest.current.placeholder = next;
        setPlaceholder(next);
    }, []);

    const writeState = useCallback((next: SidebarState | null) => {
        latest.current.state = next;
        setState(next);
    }, []);

    const writeControlState = useCallback((next: ControlState | null) => {
        latest.current.controlState = next;
        setControlState(next);
    }, []);

    const reset = useCallback(() => {
        writeState(null);
        writeControlState(null);
        writePlaceholder(null);
        setActiveSection('fields');
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
    }, [writeState, writeControlState, writePlaceholder]);

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const open = useCallback(
        (filterId: string) => {
            const current = latest.current;
            if (
                current.state !== null &&
                (current.state.isNew || current.state.filterId === filterId)
            )
                return;
            if (current.controlState?.isNew) return;
            writeControlState(null);
            writePlaceholder(null);
            setActiveSection('fields');
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            writeState({
                filterId,
                isNew: false,
                snapshot: {
                    dashboardFilters: current.dashboardFilters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
            });
        },
        [writeState, writeControlState, writePlaceholder],
    );

    const openNew = useCallback(() => {
        const current = latest.current;
        if (current.state !== null || current.controlState !== null) return;
        const rule: DashboardFilterRule = {
            id: uuidv4(),
            target: PLACEHOLDER_TARGET,
            operator: FilterOperator.EQUALS,
            values: [],
            label: undefined,
            tileTargets: {},
            disabled: true,
        };
        writePlaceholder(rule);
        setActiveSection('fields');
        writeState({
            filterId: rule.id,
            isNew: true,
            snapshot: {
                dashboardFilters: current.dashboardFilters,
                haveFiltersChanged: current.haveFiltersChanged,
            },
        });
    }, [writeState, writePlaceholder]);

    const addFirstField = useCallback(
        (field: DashboardFilterableField) => {
            const current = latest.current;
            if (current.placeholder === null) return;
            // Operator, values and tile targets come from the field; identity,
            // label and settings come from the placeholder
            const rule: DashboardFilterRule = {
                ...createDashboardFilterRuleFromField({
                    field,
                    availableTileFilters:
                        current.filterableFieldsByTileUuid ?? {},
                    isTemporary: false,
                }),
                id: current.placeholder.id,
                label: current.placeholder.label,
                lockedTabUuids: current.placeholder.lockedTabUuids,
                required: current.placeholder.required,
                requiredGroupId: current.placeholder.requiredGroupId,
                singleValue: current.placeholder.singleValue,
            };
            writeFilters((filters) =>
                isMetric(field)
                    ? { ...filters, metrics: [...filters.metrics, rule] }
                    : { ...filters, dimensions: [...filters.dimensions, rule] },
            );
            writeFiltersChanged(true);
            writePlaceholder(null);
        },
        [writeFilters, writeFiltersChanged, writePlaceholder],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            const current = latest.current;
            if (
                current.placeholder !== null &&
                current.placeholder.id === next.id
            ) {
                writePlaceholder(next);
                return;
            }
            // A field that just lost its last tile stays listed, waiting
            const previous = findFilterRule(current.dashboardFilters, next.id);
            const kept = new Set(getFilterFields(next));
            const dropped = (
                previous === null ? [] : getFilterFields(previous)
            ).filter((fieldId) => !kept.has(fieldId));
            if (dropped.length > 0) {
                setWaiting((waitingNow) => ({
                    filterId: next.id,
                    fieldIds: [
                        ...new Set([
                            ...(waitingNow?.filterId === next.id
                                ? waitingNow.fieldIds
                                : []),
                            ...dropped,
                        ]),
                    ],
                }));
            }
            writeFilters((filters) => replaceFilterRule(filters, next));
            writeFiltersChanged(true);
        },
        [writeFilters, writeFiltersChanged, writePlaceholder],
    );

    const addWaitingField = useCallback((fieldId: string) => {
        if (latest.current.state === null) return;
        const { filterId } = latest.current.state;
        setWaiting((current) => ({
            filterId,
            fieldIds: [
                ...new Set([
                    ...(current?.filterId === filterId ? current.fieldIds : []),
                    fieldId,
                ]),
            ],
        }));
    }, []);

    const removeWaitingField = useCallback(
        (fieldId: string) =>
            setWaiting((current) =>
                current === null
                    ? null
                    : {
                          ...current,
                          fieldIds: current.fieldIds.filter(
                              (id) => id !== fieldId,
                          ),
                      },
            ),
        [],
    );

    const clearFields = useCallback(() => {
        const current = latest.current;
        if (current.state === null || current.placeholder !== null) return;
        const rule = findFilterRule(
            current.dashboardFilters,
            current.state.filterId,
        );
        if (rule === null) return;
        writePlaceholder({
            ...rule,
            target: PLACEHOLDER_TARGET,
            tileTargets: {},
            values: [],
            disabled: true,
        });
        writeFilters((filters) => removeFilterRule(filters, rule.id));
        writeFiltersChanged(true);
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
    }, [writeFilters, writeFiltersChanged, writePlaceholder]);

    const removeFilterById = useCallback(
        (filterId: string) => {
            writeFilters((filters) => removeFilterRule(filters, filterId));
            writeFiltersChanged(true);
        },
        [writeFilters, writeFiltersChanged],
    );

    // Starts from the snapshot so the edits made in this session are not kept
    const removeFilter = useCallback(() => {
        const { state: editingState } = latest.current;
        if (editingState === null) return;
        const { snapshot, filterId } = editingState;
        if (editingState.isNew) {
            writeFilters(() => snapshot.dashboardFilters);
            writeFiltersChanged(snapshot.haveFiltersChanged);
        } else {
            writeFilters(() =>
                removeFilterRule(snapshot.dashboardFilters, filterId),
            );
            writeFiltersChanged(true);
        }
        reset();
    }, [writeFilters, writeFiltersChanged, reset]);

    const editingControl = useMemo(
        () => getEditingControl({ controlState, parameterControls }),
        [controlState, parameterControls],
    );

    // Opening a control keeps the edits made to the filter open before it
    const openControl = useCallback(
        (controlId: string) => {
            const current = latest.current;
            if (current.state?.isNew || current.controlState?.isNew) return;
            if (current.controlState?.controlId === controlId) return;
            writeState(null);
            writePlaceholder(null);
            setActiveSection('fields');
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            writeControlState({
                controlId,
                isNew: false,
                snapshot: {
                    parameterControls: current.parameterControls,
                    parameterValues: current.parameterValues,
                },
            });
        },
        [writeState, writeControlState, writePlaceholder],
    );

    const addParameterControl = useCallback(
        (parameterKey: string) => {
            const current = latest.current;
            if (current.placeholder === null || current.controlState !== null)
                return;
            const control: DashboardParameterControl = {
                id: uuidv4(),
                label: current.placeholder.label ?? '',
                parameterKeys: [parameterKey],
                tileTargets: {},
            };
            const snapshot = {
                parameterControls: current.parameterControls,
                parameterValues: current.parameterValues,
            };
            writeControls((controls) => [...controls, control]);
            writeState(null);
            writePlaceholder(null);
            setActiveSection('fields');
            writeControlState({
                controlId: control.id,
                isNew: true,
                snapshot,
            });
        },
        [writeControls, writeState, writeControlState, writePlaceholder],
    );

    const updateControl = useCallback(
        (next: DashboardParameterControl) =>
            writeControls((controls) =>
                controls.map((control) =>
                    control.id === next.id ? next : control,
                ),
            ),
        [writeControls],
    );

    const setControlValue = useCallback(
        (value: ParameterValue | null) =>
            getEditingControl(latest.current)?.parameterKeys.forEach((key) =>
                latest.current.setParameter(key, value),
            ),
        [],
    );

    const removeControlById = useCallback(
        (controlId: string) =>
            writeControls((controls) =>
                controls.filter((control) => control.id !== controlId),
            ),
        [writeControls],
    );

    const removeControl = useCallback(() => {
        const { controlState: editingState } = latest.current;
        if (editingState === null) return;
        writeControls(() =>
            editingState.snapshot.parameterControls.filter(
                (control) => control.id !== editingState.controlId,
            ),
        );
        reset();
    }, [writeControls, reset]);

    const discard = useCallback(() => {
        const current = latest.current;
        if (current.controlState !== null) {
            const { snapshot, controlId } = current.controlState;
            const before = snapshot.parameterControls.find(
                (control) => control.id === controlId,
            );
            // Puts back the values the control's parameters had when it was opened
            [
                ...new Set([
                    ...(getEditingControl(current)?.parameterKeys ?? []),
                    ...(before?.parameterKeys ?? []),
                ]),
            ].forEach((key) =>
                current.setParameter(
                    key,
                    snapshot.parameterValues[key] ?? null,
                ),
            );
            writeControls(() => snapshot.parameterControls);
            reset();
            return;
        }
        if (current.state === null) return;
        const { snapshot } = current.state;
        writeFilters(() => snapshot.dashboardFilters);
        writeFiltersChanged(snapshot.haveFiltersChanged);
        reset();
    }, [writeControls, writeFilters, writeFiltersChanged, reset]);

    const isControlDirty = useMemo(() => {
        if (controlState === null || editingControl === null) return false;
        const before = controlState.snapshot.parameterControls.find(
            (control) => control.id === controlState.controlId,
        );
        return (
            !isEqual(before, editingControl) ||
            editingControl.parameterKeys.some(
                (key) =>
                    !isEqual(
                        parameterValues[key],
                        controlState.snapshot.parameterValues[key],
                    ),
            )
        );
    }, [controlState, editingControl, parameterValues]);

    const isPlaceholder = state !== null && placeholder !== null;

    // The dashboard's own Save or Cancel ends the edit; nothing is restored
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    useEffect(() => {
        if (!isEditMode) {
            reset();
            setDismissedLinks([]);
        }
    }, [isEditMode, reset]);

    const newTileUuids = useMemo(() => {
        if (!savedTiles || !dashboardTiles) return [];
        const saved = new Set(savedTiles.map((tile) => tile.uuid));
        return dashboardTiles
            .map((tile) => tile.uuid)
            .filter((uuid) => !saved.has(uuid));
    }, [savedTiles, dashboardTiles]);

    const dismissLink = useCallback(
        (tileUuid: string, ruleId: string) =>
            setDismissedLinks((links) => [
                ...links,
                getLinkKey(tileUuid, ruleId),
            ]),
        [],
    );

    const editingRule = useMemo(
        () => getEditingRule({ state, placeholder, dashboardFilters }),
        [state, placeholder, dashboardFilters],
    );

    const waitingFieldIds = useMemo(() => {
        if (state === null || waiting?.filterId !== state.filterId) return [];
        const current = new Set(
            editingRule === null ? [] : getFilterFields(editingRule),
        );
        return waiting.fieldIds.filter((fieldId) => !current.has(fieldId));
    }, [state, waiting, editingRule]);

    // Keeps the edits, which already live in the dashboard draft
    const close = useCallback(() => {
        const current = latest.current;
        if (current.controlState !== null) {
            const isUnlabelled =
                (getEditingControl(current)?.label ?? '').trim() === '';
            if (current.controlState.isNew && isUnlabelled) discard();
            else reset();
            return;
        }
        if (current.state === null) return;
        const rule = getEditingRule(current);
        if (rule === null || !canKeepFilterRule(rule, current.state.isNew)) {
            discard();
            return;
        }
        if (isDefaultValueIncomplete(rule)) {
            writeFilters((filters) =>
                replaceFilterRule(filters, { ...rule, disabled: true }),
            );
        }
        reset();
    }, [discard, reset, writeFilters]);

    // Its own memo so a hover does not hand selectors a new object
    const editingFilterId = state?.filterId ?? null;
    const editing = useMemo(
        () => (editingFilterId === null ? null : { filterId: editingFilterId }),
        [editingFilterId],
    );

    const value = useMemo<ControlsSidebarContextValue>(
        () => ({
            editing,
            isNew: state?.isNew ?? false,
            isPlaceholder,
            editingRule,
            isSidebarOpen: state !== null || controlState !== null,
            editingControl,
            isNewControl: controlState?.isNew ?? false,
            openControl,
            addParameterControl,
            updateControl,
            setControlValue,
            removeControl,
            removeControlById,
            newTileUuids,
            dismissedLinks,
            dismissLink,
            activeSection,
            setActiveSection,
            open,
            openNew,
            addFirstField,
            clearFields,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            highlightedFieldId,
            setHighlightedFieldId,
            hoveredFieldId,
            setHoveredFieldId,
            activeFieldId: hoveredFieldId ?? highlightedFieldId,
            updateFilter,
            removeFilter,
            removeFilterById,
            discard,
            close,
            isDirty:
                isControlDirty ||
                (state !== null &&
                    (isPlaceholder ||
                        isFilterRuleDirty(
                            state.snapshot.dashboardFilters,
                            dashboardFilters,
                            state.filterId,
                        ))),
        }),
        [
            state,
            editing,
            isPlaceholder,
            editingRule,
            activeSection,
            open,
            openNew,
            addFirstField,
            clearFields,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            highlightedFieldId,
            hoveredFieldId,
            updateFilter,
            removeFilter,
            removeFilterById,
            discard,
            close,
            dashboardFilters,
            controlState,
            editingControl,
            isControlDirty,
            openControl,
            addParameterControl,
            updateControl,
            setControlValue,
            removeControl,
            removeControlById,
            newTileUuids,
            dismissedLinks,
            dismissLink,
        ],
    );

    return (
        <ControlsSidebarContext.Provider value={value}>
            {children}
        </ControlsSidebarContext.Provider>
    );
};
