import {
    createDashboardFilterRuleFromField,
    FilterOperator,
    isMetric,
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
import { v4 as uuidv4 } from 'uuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    findFilterRule,
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

    const [state, setState] = useState<SidebarState | null>(null);
    // Lives here, never in the dashboard filters, until it gets a mapping
    const [placeholder, setPlaceholder] = useState<DashboardFilterRule | null>(
        null,
    );
    const [activeSection, setActiveSection] =
        useState<ControlsSidebarSection>('fields');

    const close = useCallback(() => {
        setState(null);
        setPlaceholder(null);
        setActiveSection('fields');
    }, []);

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const open = useCallback(
        (filterId: string) => {
            if (state !== null && (state.isNew || state.filterId === filterId))
                return;
            setPlaceholder(null);
            setActiveSection('fields');
            setState({
                filterId,
                isNew: false,
                snapshot: { dashboardFilters, haveFiltersChanged },
            });
        },
        [state, dashboardFilters, haveFiltersChanged],
    );

    const openNew = useCallback(() => {
        if (state !== null) return;
        const rule: DashboardFilterRule = {
            id: uuidv4(),
            target: PLACEHOLDER_TARGET,
            operator: FilterOperator.EQUALS,
            values: [],
            label: undefined,
            tileTargets: {},
            disabled: true,
        };
        setPlaceholder(rule);
        setActiveSection('fields');
        setState({
            filterId: rule.id,
            isNew: true,
            snapshot: { dashboardFilters, haveFiltersChanged },
        });
    }, [state, dashboardFilters, haveFiltersChanged]);

    const addFirstField = useCallback(
        (field: DashboardFilterableField) => {
            if (placeholder === null) return;
            // Operator and tile targets come from the field; identity and
            // label come from the placeholder
            const rule: DashboardFilterRule = {
                ...createDashboardFilterRuleFromField({
                    field,
                    availableTileFilters: filterableFieldsByTileUuid ?? {},
                    isTemporary: false,
                }),
                id: placeholder.id,
                label: placeholder.label,
            };
            setDashboardFilters((filters) =>
                isMetric(field)
                    ? { ...filters, metrics: [...filters.metrics, rule] }
                    : { ...filters, dimensions: [...filters.dimensions, rule] },
            );
            setHaveFiltersChanged(true);
            setPlaceholder(null);
        },
        [
            placeholder,
            filterableFieldsByTileUuid,
            setDashboardFilters,
            setHaveFiltersChanged,
        ],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            if (placeholder !== null && placeholder.id === next.id) {
                setPlaceholder(next);
                return;
            }
            setDashboardFilters((filters) => replaceFilterRule(filters, next));
            setHaveFiltersChanged(true);
        },
        [placeholder, setDashboardFilters, setHaveFiltersChanged],
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

    // Starts from the snapshot so the edits made in this session are not kept
    const removeFilter = useCallback(() => {
        if (state === null) return;
        if (placeholder === null) {
            setDashboardFilters(
                removeFilterRule(
                    state.snapshot.dashboardFilters,
                    state.filterId,
                ),
            );
            setHaveFiltersChanged(true);
        }
        close();
    }, [state, placeholder, setDashboardFilters, setHaveFiltersChanged, close]);

    const cancel = useCallback(() => {
        if (state === null) return;
        setDashboardFilters(state.snapshot.dashboardFilters);
        setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        close();
    }, [state, setDashboardFilters, setHaveFiltersChanged, close]);

    const isPlaceholder = state !== null && placeholder !== null;

    const apply = useCallback(() => {
        if (isPlaceholder) return;
        close();
    }, [isPlaceholder, close]);

    // The dashboard's own Save or Cancel ends the edit; nothing is restored
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    useEffect(() => {
        if (!isEditMode) close();
    }, [isEditMode, close]);

    const editingRule = useMemo(
        () =>
            state === null
                ? null
                : (placeholder ??
                  findFilterRule(dashboardFilters, state.filterId)),
        [state, placeholder, dashboardFilters],
    );

    const value = useMemo<ControlsSidebarContextValue>(
        () => ({
            editing: state === null ? null : { filterId: state.filterId },
            isNew: state?.isNew ?? false,
            isPlaceholder,
            editingRule,
            isSidebarOpen: state !== null,
            activeSection,
            setActiveSection,
            open,
            openNew,
            addFirstField,
            updateFilter,
            removeFilter,
            removeFilterById,
            cancel,
            apply,
            isDirty:
                state !== null &&
                (isPlaceholder ||
                    isFilterRuleDirty(
                        state.snapshot.dashboardFilters,
                        dashboardFilters,
                        state.filterId,
                    )),
        }),
        [
            state,
            isPlaceholder,
            editingRule,
            activeSection,
            open,
            openNew,
            addFirstField,
            updateFilter,
            removeFilter,
            removeFilterById,
            cancel,
            apply,
            dashboardFilters,
        ],
    );

    return (
        <ControlsSidebarContext.Provider value={value}>
            {children}
        </ControlsSidebarContext.Provider>
    );
};
