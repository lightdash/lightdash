import {
    createDashboardFilterRuleFromField,
    FilterOperator,
    isMetric,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
    type ParameterValue,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldKind } from './fieldKinds';
import { getLinkKey } from './linkCandidates';
import {
    getControlsFromSavedValues,
    type ParameterControl,
} from './parameterControls';
import {
    getFilterSessionSettings,
    patchFilterSessionSettings,
    type FilterSessionSettings,
    type SessionSettingsByFilterId,
} from './sessionSettings';
import {
    findFilterRule,
    isUnplacedRule,
    UNPLACED_TARGET,
    isFilterRuleDirty,
    removeFilterRule,
    replaceFilterRule,
    type FilterSidebarSnapshot,
} from './sidebarState';
import {
    FilterSidebarContext,
    type FilterSidebarContextValue,
    type FilterSidebarSection,
} from './useFilterSidebar';

type SidebarState = {
    // null while a new filter has no field yet
    filterId: string | null;
    isNew: boolean;
    snapshot: FilterSidebarSnapshot;
    sessionSnapshot: SessionSettingsByFilterId;
};

export const FilterSidebarProvider: FC<PropsWithChildren> = ({ children }) => {
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

    const [state, setState] = useState<SidebarState | null>(null);
    const [unplacedFilters, setUnplacedFilters] = useState<
        DashboardFilterRule[]
    >([]);
    // Kind chosen on the first screen, so Add a field stays on it
    const [unplacedKinds, setUnplacedKinds] = useState<
        Record<string, FilterType>
    >({});
    const [activeSection, setActiveSection] =
        useState<FilterSidebarSection>('interactivity');
    const [waitingField, setWaitingField] =
        useState<DashboardFieldTarget | null>(null);
    const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(
        null,
    );
    const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
    // Session only: fields kept listed while they sit on no chart.
    const [listedFieldIds, setListedFieldIds] = useState<string[]>([]);
    // Kept for the page session: not cleared when the sidebar closes
    const [sessionSettings, setSessionSettings] =
        useState<SessionSettingsByFilterId>({});

    const dashboardParameters = useDashboardContext(
        (c) => c.dashboardParameters,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    // Tiles present when editing started; later ones get a link prompt
    const [knownTileUuids, setKnownTileUuids] = useState<string[] | null>(null);
    const [dismissedLinks, setDismissedLinks] = useState<string[]>([]);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const setParameter = useDashboardContext((c) => c.setParameter);

    // Session only: one control per saved parameter value until authored
    const [parameterControls, setParameterControls] = useState<
        ParameterControl[]
    >([]);
    const [editingControlId, setEditingControlId] = useState<string | null>(
        null,
    );
    const controlSnapshot = useRef<{
        control: ParameterControl;
        values: Record<string, ParameterValue | null>;
    } | null>(null);
    const hasSeededControls = useRef(false);
    useEffect(() => {
        if (
            hasSeededControls.current ||
            Object.keys(parameterDefinitions).length === 0
        )
            return;
        hasSeededControls.current = true;
        const savedValues = Object.fromEntries(
            Object.values(dashboardParameters).map((p) => [
                p.parameterName,
                p.value,
            ]),
        );
        setParameterControls((current) =>
            current.length === 0
                ? getControlsFromSavedValues(savedValues, parameterDefinitions)
                : current,
        );
    }, [dashboardParameters, parameterDefinitions]);

    const getSessionSettings = useCallback(
        (filterId: string) =>
            getFilterSessionSettings(sessionSettings, filterId),
        [sessionSettings],
    );

    const updateSessionSettings = useCallback(
        (filterId: string, patch: Partial<FilterSessionSettings>) => {
            setSessionSettings((all) =>
                patchFilterSessionSettings(all, filterId, patch),
            );
        },
        [],
    );

    const listFieldId = useCallback((fieldId: string) => {
        setListedFieldIds((ids) =>
            ids.includes(fieldId) ? ids : [...ids, fieldId],
        );
    }, []);

    const unlistFieldId = useCallback((fieldId: string) => {
        setListedFieldIds((ids) => ids.filter((id) => id !== fieldId));
    }, []);

    const resetSession = useCallback(() => {
        setState(null);
        setActiveSection('interactivity');
        setWaitingField(null);
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        setListedFieldIds([]);
    }, []);

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const open = useCallback(
        (filterId: string) => {
            setState((current) => {
                if (current !== null && current.filterId === filterId) {
                    return current;
                }
                if (current !== null && current.isNew) return current;
                return {
                    filterId,
                    isNew: false,
                    snapshot: {
                        dashboardFilters,
                        haveFiltersChanged,
                        unplacedFilters,
                    },
                    sessionSnapshot: sessionSettings,
                };
            });
            setWaitingField(null);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setListedFieldIds([]);
        },
        [
            dashboardFilters,
            haveFiltersChanged,
            unplacedFilters,
            sessionSettings,
        ],
    );

    const openNew = useCallback(() => {
        controlSnapshot.current = null;
        setEditingControlId(null);
        setState((current) =>
            current !== null
                ? current
                : {
                      filterId: null,
                      isNew: true,
                      snapshot: {
                          dashboardFilters,
                          haveFiltersChanged,
                          unplacedFilters,
                      },
                      sessionSnapshot: sessionSettings,
                  },
        );
    }, [
        dashboardFilters,
        haveFiltersChanged,
        unplacedFilters,
        sessionSettings,
    ]);

    // Kind first: a filter with no field, edited like any other
    const openKind = useCallback(
        (kind: FilterType) => {
            if (state === null || !state.isNew || state.filterId !== null)
                return;
            const rule: DashboardFilterRule = {
                id: uuidv4(),
                target: UNPLACED_TARGET,
                operator: FilterOperator.EQUALS,
                values: [],
                label: undefined,
                tileTargets: {},
            };
            setUnplacedFilters((current) => [...current, rule]);
            setUnplacedKinds((current) => ({ ...current, [rule.id]: kind }));
            setState({ ...state, filterId: rule.id });
            setActiveSection('interactivity');
        },
        [state],
    );

    const addFirstField = useCallback(
        (field: DashboardFilterableField) => {
            if (state === null) return;
            const unplaced =
                state.filterId === null
                    ? null
                    : (unplacedFilters.find((r) => r.id === state.filterId) ??
                      null);
            if (state.filterId !== null && unplaced === null) return;
            const builtRule: DashboardFilterRule =
                createDashboardFilterRuleFromField({
                    field,
                    availableTileFilters: filterableFieldsByTileUuid ?? {},
                    isTemporary: false,
                });
            // The draft keeps its identity and settings; its operator and
            // values survive only when the field is of the kind it was given
            const keepsValue =
                unplaced !== null &&
                unplacedKinds[unplaced.id] === getFieldKind(field);
            const newRule: DashboardFilterRule =
                unplaced === null
                    ? builtRule
                    : {
                          ...builtRule,
                          id: unplaced.id,
                          label: unplaced.label,
                          lockedTabUuids: unplaced.lockedTabUuids,
                          required: unplaced.required,
                          requiredGroupId: unplaced.requiredGroupId,
                          singleValue: unplaced.singleValue,
                          disabled: unplaced.disabled,
                          ...(keepsValue
                              ? {
                                    operator: unplaced.operator,
                                    values: unplaced.values,
                                }
                              : {}),
                      };
            setUnplacedFilters((current) =>
                current.filter((r) => r.id !== newRule.id),
            );
            setDashboardFilters((filters) =>
                isMetric(field)
                    ? { ...filters, metrics: [...filters.metrics, newRule] }
                    : {
                          ...filters,
                          dimensions: [...filters.dimensions, newRule],
                      },
            );
            setHaveFiltersChanged(true);
            setState({ ...state, filterId: newRule.id });
        },
        [
            state,
            unplacedFilters,
            unplacedKinds,
            filterableFieldsByTileUuid,
            setDashboardFilters,
            setHaveFiltersChanged,
        ],
    );

    const removeFilterById = useCallback(
        (filterId: string) => {
            setUnplacedFilters((current) =>
                current.filter((r) => r.id !== filterId),
            );
            setDashboardFilters((filters) =>
                removeFilterRule(filters, filterId),
            );
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters, setHaveFiltersChanged],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            if (isUnplacedRule(next)) {
                setUnplacedFilters((current) =>
                    current.map((r) => (r.id === next.id ? next : r)),
                );
                return;
            }
            setDashboardFilters((filters) => replaceFilterRule(filters, next));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters, setHaveFiltersChanged],
    );

    const cancel = useCallback(() => {
        if (state === null) return;
        setDashboardFilters(state.snapshot.dashboardFilters);
        setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        setUnplacedFilters(state.snapshot.unplacedFilters);
        setSessionSettings(state.sessionSnapshot);
        resetSession();
    }, [state, setDashboardFilters, setHaveFiltersChanged, resetSession]);

    // Drops the draft rule but keeps the new-filter picker open
    const backToPicker = useCallback(() => {
        if (state === null || !state.isNew || state.filterId === null) return;
        setDashboardFilters(state.snapshot.dashboardFilters);
        setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        setUnplacedFilters(state.snapshot.unplacedFilters);
        setSessionSettings(state.sessionSnapshot);
        setListedFieldIds([]);
        setState({ ...state, filterId: null });
    }, [state, setDashboardFilters, setHaveFiltersChanged]);

    const editingFilterId = state?.filterId ?? null;
    const editingRule = useMemo(
        () =>
            editingFilterId === null
                ? null
                : (findFilterRule(dashboardFilters, editingFilterId) ??
                  unplacedFilters.find((r) => r.id === editingFilterId) ??
                  null),
        [editingFilterId, dashboardFilters, unplacedFilters],
    );
    const isUnplaced = editingRule !== null && isUnplacedRule(editingRule);
    const unplacedKind =
        editingFilterId === null
            ? null
            : (unplacedKinds[editingFilterId] ?? null);

    const apply = useCallback(() => resetSession(), [resetSession]);

    const openControl = useCallback(
        (id: string) => {
            const control = parameterControls.find((c) => c.id === id);
            if (control === undefined) return;
            // An edited filter is applied first, as open() does for filters
            if (state !== null) resetSession();
            controlSnapshot.current = {
                control,
                values: Object.fromEntries(
                    control.parameterKeys.map((key) => [
                        key,
                        parameterValues[key] ?? null,
                    ]),
                ),
            };
            setEditingControlId(id);
        },
        [parameterControls, parameterValues, state, resetSession],
    );

    const addControl = useCallback(
        (control: ParameterControl) => {
            if (state !== null) resetSession();
            setParameterControls((current) => [...current, control]);
            controlSnapshot.current = null;
            setEditingControlId(control.id);
        },
        [state, resetSession],
    );

    const updateControl = useCallback(
        (id: string, patch: Partial<Omit<ParameterControl, 'id'>>) => {
            setParameterControls((current) =>
                current.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            );
        },
        [],
    );

    const removeControl = useCallback((id: string) => {
        setParameterControls((current) => current.filter((c) => c.id !== id));
        setEditingControlId((current) => (current === id ? null : current));
    }, []);

    const setControlValue = useCallback(
        (id: string, value: ParameterValue | null) => {
            const control = parameterControls.find((c) => c.id === id);
            control?.parameterKeys.forEach((key) => setParameter(key, value));
        },
        [parameterControls, setParameter],
    );

    const closeControl = useCallback(() => {
        controlSnapshot.current = null;
        setEditingControlId(null);
    }, []);

    // A new control (no snapshot) is dropped; an opened one is restored
    const cancelControl = useCallback(() => {
        const snapshot = controlSnapshot.current;
        if (editingControlId === null) return;
        if (snapshot === null) {
            setParameterControls((current) =>
                current.filter((c) => c.id !== editingControlId),
            );
        } else {
            setParameterControls((current) =>
                current.map((c) =>
                    c.id === editingControlId ? snapshot.control : c,
                ),
            );
            Object.entries(snapshot.values).forEach(([key, value]) =>
                setParameter(key, value),
            );
        }
        closeControl();
    }, [editingControlId, setParameter, closeControl]);

    const clearFields = useCallback(() => {
        if (state === null || state.isNew || state.filterId === null) return;
        const rule = findFilterRule(dashboardFilters, state.filterId);
        if (rule === null) return;
        // Any kind is allowed again, so the picker is unlocked
        setUnplacedKinds(({ [rule.id]: _dropped, ...rest }) => rest);
        setUnplacedFilters((current) => [
            ...current,
            { ...rule, target: UNPLACED_TARGET, tileTargets: {} },
        ]);
        setDashboardFilters((filters) => removeFilterRule(filters, rule.id));
        setHaveFiltersChanged(true);
        setListedFieldIds([]);
        setWaitingField(null);
        setHighlightedFieldId(null);
    }, [state, dashboardFilters, setDashboardFilters, setHaveFiltersChanged]);

    // Starts from the snapshot so edits made to other filters are not kept
    const removeFilter = useCallback(() => {
        if (state === null || state.filterId === null) return;
        const { filterId } = state;
        setUnplacedFilters((current) =>
            current.filter((r) => r.id !== filterId),
        );
        setDashboardFilters(
            removeFilterRule(state.snapshot.dashboardFilters, filterId),
        );
        setHaveFiltersChanged(true);
        resetSession();
    }, [state, setDashboardFilters, setHaveFiltersChanged, resetSession]);

    // The dashboard's own Save or Cancel ends the edit; nothing is restored
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    useEffect(() => {
        if (!isEditMode) {
            resetSession();
            setUnplacedFilters([]);
            setUnplacedKinds({});
            setKnownTileUuids(null);
            setDismissedLinks([]);
        }
    }, [isEditMode, resetSession]);
    useEffect(() => {
        if (isEditMode && knownTileUuids === null && dashboardTiles) {
            setKnownTileUuids(dashboardTiles.map((tile) => tile.uuid));
        }
    }, [isEditMode, knownTileUuids, dashboardTiles]);
    const newTileUuids = useMemo(
        () =>
            knownTileUuids === null
                ? []
                : (dashboardTiles ?? [])
                      .map((tile) => tile.uuid)
                      .filter((uuid) => !knownTileUuids.includes(uuid)),
        [knownTileUuids, dashboardTiles],
    );
    const dismissLink = useCallback(
        (tileUuid: string, ruleId: string) =>
            setDismissedLinks((prev) => [
                ...prev,
                getLinkKey(tileUuid, ruleId),
            ]),
        [],
    );

    const value = useMemo<FilterSidebarContextValue>(
        () => ({
            parameterControls,
            editingControlId,
            isSidebarOpen: state !== null || editingControlId !== null,
            newTileUuids,
            dismissedLinks,
            dismissLink,
            openControl,
            addControl,
            updateControl,
            removeControl,
            setControlValue,
            closeControl,
            cancelControl,
            editing: state === null ? null : { filterId: state.filterId },
            isNew: state?.isNew ?? false,
            isUnplaced,
            unplacedKind,
            unplacedFilters,
            clearFields,
            openKind,
            originalFilterRule:
                state === null || editingFilterId === null
                    ? null
                    : findFilterRule(
                          state.snapshot.dashboardFilters,
                          editingFilterId,
                      ),
            editingRule,
            waitingField,
            setWaitingField,
            highlightedFieldId,
            setHighlightedFieldId,
            hoveredFieldId,
            setHoveredFieldId,
            activeFieldId: hoveredFieldId ?? highlightedFieldId,
            listedFieldIds,
            listFieldId,
            unlistFieldId,
            activeSection,
            setActiveSection,
            open,
            openNew,
            addFirstField,
            removeFilter,
            removeFilterById,
            updateFilter,
            getSessionSettings,
            updateSessionSettings,
            cancel,
            backToPicker,
            apply,
            isDirty:
                isUnplaced ||
                (state !== null &&
                    editingFilterId !== null &&
                    isFilterRuleDirty(
                        state.snapshot.dashboardFilters,
                        dashboardFilters,
                        editingFilterId,
                    )),
        }),
        [
            state,
            isUnplaced,
            unplacedKind,
            unplacedFilters,
            clearFields,
            openKind,
            editingRule,
            editingFilterId,
            activeSection,
            open,
            openNew,
            addFirstField,
            removeFilter,
            removeFilterById,
            updateFilter,
            getSessionSettings,
            updateSessionSettings,
            cancel,
            backToPicker,
            apply,
            dashboardFilters,
            waitingField,
            highlightedFieldId,
            hoveredFieldId,
            listedFieldIds,
            listFieldId,
            unlistFieldId,
            parameterControls,
            editingControlId,
            openControl,
            addControl,
            updateControl,
            removeControl,
            setControlValue,
            closeControl,
            cancelControl,
            newTileUuids,
            dismissedLinks,
            dismissLink,
        ],
    );

    return (
        <FilterSidebarContext.Provider value={value}>
            {children}
        </FilterSidebarContext.Provider>
    );
};
