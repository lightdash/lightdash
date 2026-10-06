import {
    createDashboardFilterRuleFromField,
    isMetric,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
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
    const [activeSection, setActiveSection] =
        useState<FilterSidebarSection>('fields');
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
        setActiveSection('fields');
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
            if (state === null || !state.isNew || state.filterId !== null)
                return;
            const newRule: DashboardFilterRule =
                createDashboardFilterRuleFromField({
                    field,
                    availableTileFilters: filterableFieldsByTileUuid ?? {},
                    isTemporary: false,
                });
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

    const apply = resetSession;

    const editingFilterId = state?.filterId ?? null;
    const removeFilter = useCallback(() => {
        if (editingFilterId === null) return;
        removeFilterById(editingFilterId);
        resetSession();
    }, [editingFilterId, removeFilterById, resetSession]);

    const value = useMemo<FilterSidebarContextValue>(
        () => ({
            isParametersOpen: isParametersOpen && state === null,
            openParameters,
            closeParameters,
            editing: state === null ? null : { filterId: state.filterId },
            isNew: state?.isNew ?? false,
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
                state !== null &&
                editingFilterId !== null &&
                isFilterRuleDirty(
                    state.snapshot.dashboardFilters,
                    dashboardFilters,
                    editingFilterId,
                ),
        }),
        [
            state,
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
