import {
    createDashboardFilterRuleFromField,
    isMetric,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
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
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
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

// What survives when every field is removed from an existing filter
type EmptyDraft = Pick<
    DashboardFilterRule,
    | 'id'
    | 'label'
    | 'lockedTabUuids'
    | 'required'
    | 'requiredGroupId'
    | 'singleValue'
>;

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
    const [emptyDraft, setEmptyDraft] = useState<EmptyDraft | null>(null);
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
        setEmptyDraft(null);
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
                    snapshot: { dashboardFilters, haveFiltersChanged },
                    sessionSnapshot: sessionSettings,
                };
            });
            setEmptyDraft(null);
            setWaitingField(null);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setListedFieldIds([]);
        },
        [dashboardFilters, haveFiltersChanged, sessionSettings],
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
                      snapshot: { dashboardFilters, haveFiltersChanged },
                      sessionSnapshot: sessionSettings,
                  },
        );
    }, [dashboardFilters, haveFiltersChanged, sessionSettings]);

    const addFirstField = useCallback(
        (field: DashboardFilterableField) => {
            if (state === null) return;
            const isNewWithoutField = state.isNew && state.filterId === null;
            if (!isNewWithoutField && emptyDraft === null) return;
            const builtRule: DashboardFilterRule =
                createDashboardFilterRuleFromField({
                    field,
                    availableTileFilters: filterableFieldsByTileUuid ?? {},
                    isTemporary: false,
                });
            // Operator and values come from the new field; identity and
            // settings come from the draft so the filter keeps its id
            const newRule: DashboardFilterRule =
                emptyDraft === null
                    ? builtRule
                    : { ...builtRule, ...emptyDraft };
            setDashboardFilters((filters) =>
                isMetric(field)
                    ? { ...filters, metrics: [...filters.metrics, newRule] }
                    : {
                          ...filters,
                          dimensions: [...filters.dimensions, newRule],
                      },
            );
            setHaveFiltersChanged(true);
            setEmptyDraft(null);
            setState({ ...state, filterId: newRule.id });
        },
        [
            state,
            emptyDraft,
            filterableFieldsByTileUuid,
            setDashboardFilters,
            setHaveFiltersChanged,
        ],
    );

    const removeFilterById = useCallback(
        (filterId: string) => {
            setDashboardFilters((filters) =>
                removeFilterRule(filters, filterId),
            );
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters, setHaveFiltersChanged],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            setDashboardFilters((filters) => replaceFilterRule(filters, next));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters, setHaveFiltersChanged],
    );

    const cancel = useCallback(() => {
        if (state === null) return;
        setDashboardFilters(state.snapshot.dashboardFilters);
        setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        setSessionSettings(state.sessionSnapshot);
        resetSession();
    }, [state, setDashboardFilters, setHaveFiltersChanged, resetSession]);

    // Drops the draft rule but keeps the new-filter picker open
    const backToPicker = useCallback(() => {
        if (state === null || !state.isNew || state.filterId === null) return;
        setDashboardFilters(state.snapshot.dashboardFilters);
        setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        setSessionSettings(state.sessionSnapshot);
        setListedFieldIds([]);
        setState({ ...state, filterId: null });
    }, [state, setDashboardFilters, setHaveFiltersChanged]);

    const isEmpty = emptyDraft !== null;

    const apply = useCallback(() => {
        if (isEmpty) return;
        resetSession();
    }, [isEmpty, resetSession]);

    const openControl = useCallback(
        (id: string) => {
            const control = parameterControls.find((c) => c.id === id);
            if (control === undefined) return;
            // An edited filter is applied first, as open() does for filters
            if (state !== null && !isEmpty) resetSession();
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
        [parameterControls, parameterValues, state, isEmpty, resetSession],
    );

    const addControl = useCallback(
        (control: ParameterControl) => {
            if (state !== null && !isEmpty) resetSession();
            setParameterControls((current) => [...current, control]);
            controlSnapshot.current = null;
            setEditingControlId(control.id);
        },
        [state, isEmpty, resetSession],
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
        setEmptyDraft({
            id: rule.id,
            label: rule.label,
            lockedTabUuids: rule.lockedTabUuids,
            required: rule.required,
            requiredGroupId: rule.requiredGroupId,
            singleValue: rule.singleValue,
        });
        setDashboardFilters((filters) => removeFilterRule(filters, rule.id));
        setHaveFiltersChanged(true);
        setListedFieldIds([]);
        setWaitingField(null);
        setHighlightedFieldId(null);
    }, [state, dashboardFilters, setDashboardFilters, setHaveFiltersChanged]);

    const editingFilterId = state?.filterId ?? null;
    // Starts from the snapshot so edits made to other filters are not kept
    const removeFilter = useCallback(() => {
        if (state === null || state.filterId === null) return;
        if (emptyDraft !== null) {
            // The rule is already gone from the dashboard filters
            resetSession();
            return;
        }
        setDashboardFilters(
            removeFilterRule(state.snapshot.dashboardFilters, state.filterId),
        );
        setHaveFiltersChanged(true);
        resetSession();
    }, [
        state,
        emptyDraft,
        setDashboardFilters,
        setHaveFiltersChanged,
        resetSession,
    ]);

    // The dashboard's own Save or Cancel ends the edit; nothing is restored
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    useEffect(() => {
        if (!isEditMode) resetSession();
    }, [isEditMode, resetSession]);

    const value = useMemo<FilterSidebarContextValue>(
        () => ({
            parameterControls,
            editingControlId,
            isSidebarOpen: state !== null || editingControlId !== null,
            openControl,
            addControl,
            updateControl,
            removeControl,
            setControlValue,
            closeControl,
            cancelControl,
            editing: state === null ? null : { filterId: state.filterId },
            isNew: state?.isNew ?? false,
            isEmpty,
            clearFields,
            originalFilterRule:
                state === null || editingFilterId === null
                    ? null
                    : findFilterRule(
                          state.snapshot.dashboardFilters,
                          editingFilterId,
                      ),
            editingRule:
                editingFilterId === null
                    ? null
                    : findFilterRule(dashboardFilters, editingFilterId),
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
                isEmpty ||
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
            isEmpty,
            clearFields,
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
        ],
    );

    return (
        <FilterSidebarContext.Provider value={value}>
            {children}
        </FilterSidebarContext.Provider>
    );
};
