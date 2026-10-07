import {
    createDashboardFilterRuleFromField,
    isMetric,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useParams } from 'react-router';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
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
    // Session only: fields kept listed while they sit on no chart.
    const [listedFieldIds, setListedFieldIds] = useState<string[]>([]);
    // Kept for the page session: not cleared when the sidebar closes
    const [sessionSettings, setSessionSettings] =
        useState<SessionSettingsByFilterId>({});

    const [isParametersOpen, setIsParametersOpen] = useState(false);
    // Only opens while no filter is being edited
    const openParameters = useCallback(() => setIsParametersOpen(true), []);
    const closeParameters = useCallback(() => setIsParametersOpen(false), []);

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
        setListedFieldIds([]);
    }, []);

    const open = useCallback(
        (filterId: string) => {
            setState((current) =>
                current !== null
                    ? current
                    : {
                          filterId,
                          isNew: false,
                          snapshot: { dashboardFilters, haveFiltersChanged },
                          sessionSnapshot: sessionSettings,
                      },
            );
        },
        [dashboardFilters, haveFiltersChanged, sessionSettings],
    );

    const openNew = useCallback(() => {
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

    const isEmpty = emptyDraft !== null;

    const apply = useCallback(() => {
        if (isEmpty) return;
        resetSession();
    }, [isEmpty, resetSession]);

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
            isParametersOpen: isParametersOpen && state === null,
            openParameters,
            closeParameters,
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
            apply,
            dashboardFilters,
            waitingField,
            highlightedFieldId,
            listedFieldIds,
            listFieldId,
            unlistFieldId,
            isParametersOpen,
            openParameters,
            closeParameters,
        ],
    );

    return (
        <FilterSidebarContext.Provider value={value}>
            {children}
        </FilterSidebarContext.Provider>
    );
};
