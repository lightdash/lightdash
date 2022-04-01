import {
    Dashboard,
    DashboardFilterRule,
    DashboardFilters,
    DashboardTileTypes,
    fieldId,
} from 'common';
import React, {
    createContext,
    Dispatch,
    SetStateAction,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { FieldsWithSuggestions } from '../components/common/Filters/FiltersProvider';
import {
    useAvailableDashboardFilterTargets,
    useDashboardQuery,
} from '../hooks/dashboard/useDashboard';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
};

type DashboardContext = {
    dashboard: Dashboard | undefined;
    fieldsWithSuggestions: FieldsWithSuggestions;
    dashboardTiles: DashboardTileTypes | [];
    setDashboardTiles: Dispatch<SetStateAction<DashboardTileTypes | []>>;
    dashboardFilters: DashboardFilters;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    addDimensionDashboardFilter: (filter: DashboardFilterRule) => void;
    updateDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
    ) => void;
    removeDimensionDashboardFilter: (index: number) => void;
    addMetricDashboardFilter: (filter: DashboardFilterRule) => void;
    haveFiltersChanged: boolean;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    addSuggestions: (newSuggestionsMap: Record<string, string[]>) => void;
};

const Context = createContext<DashboardContext | undefined>(undefined);

export const DashboardProvider: React.FC = ({ children }) => {
    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>();

    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const [dashboardTiles, setDashboardTiles] = useState<
        DashboardTileTypes | []
    >([]);
    const { data: filterableFields } = useAvailableDashboardFilterTargets(
        dashboard,
        dashboardTiles,
    );
    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});
    const [dashboardFilters, setDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] =
        useState<boolean>(false);

    useEffect(() => {
        if (dashboard) {
            setDashboardFilters(dashboard.filters);
            setHaveFiltersChanged(false);
        }
    }, [dashboard]);

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule) => {
            setDashboardFilters((previousFilters) => ({
                dimensions: [...previousFilters.dimensions, filter],
                metrics: previousFilters.metrics,
            }));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters],
    );
    const updateDimensionDashboardFilter = useCallback(
        (item: DashboardFilterRule, index: number) => {
            setDashboardFilters((previousFilters) => ({
                dimensions: [
                    ...previousFilters.dimensions.slice(0, index),
                    item,
                    ...previousFilters.dimensions.slice(index + 1),
                ],
                metrics: previousFilters.metrics,
            }));
            setHaveFiltersChanged(true);
        },
        [],
    );
    const addMetricDashboardFilter = useCallback((filter) => {
        setDashboardFilters((previousFilters) => ({
            dimensions: previousFilters.dimensions,
            metrics: [...previousFilters.metrics, filter],
        }));
        setHaveFiltersChanged(true);
    }, []);

    const removeDimensionDashboardFilter = useCallback((index: number) => {
        setDashboardFilters((previousFilters) => ({
            dimensions: [
                ...previousFilters.dimensions.slice(0, index),
                ...previousFilters.dimensions.slice(index + 1),
            ],
            metrics: previousFilters.metrics,
        }));
        setHaveFiltersChanged(true);
    }, []);

    useEffect(() => {
        if (filterableFields.length > 0) {
            setFieldsWithSuggestions((prev) =>
                filterableFields.reduce<FieldsWithSuggestions>(
                    (sum, field) => ({
                        ...sum,
                        [fieldId(field)]: {
                            ...field,
                            suggestions:
                                prev[fieldId(field)]?.suggestions || [],
                        },
                    }),
                    {},
                ),
            );
        }
    }, [filterableFields]);

    const addSuggestions = useCallback(
        (newSuggestionsMap: Record<string, string[]>) => {
            setFieldsWithSuggestions((prev) => {
                return Object.entries(prev).reduce<FieldsWithSuggestions>(
                    (sum, [key, field]) => {
                        const currentSuggestions = field?.suggestions || [];
                        const newSuggestions = newSuggestionsMap[key] || [];
                        const suggestions = Array.from(
                            new Set([...currentSuggestions, ...newSuggestions]),
                        ).sort((a, b) => a.localeCompare(b));
                        return { ...sum, [key]: { ...field, suggestions } };
                    },
                    {},
                );
            });
        },
        [],
    );

    const { search, pathname } = useLocation();
    const history = useHistory();

    useMount(() => {
        const searchParams = new URLSearchParams(search);
        const filterSearchParam = searchParams.get('filters');
        if (filterSearchParam) {
            setDashboardFilters(JSON.parse(filterSearchParam));
        }
    });

    useEffect(() => {
        const newParams = new URLSearchParams();
        if (
            dashboardFilters.dimensions.length === 0 &&
            dashboardFilters.metrics.length === 0
        ) {
            newParams.delete('filters');
        } else {
            newParams.set('filters', JSON.stringify(dashboardFilters));
        }
        history.replace({
            pathname,
            search: newParams.toString(),
        });
    }, [dashboardFilters, history, pathname]);

    const value = {
        dashboard,
        fieldsWithSuggestions,
        dashboardTiles,
        setDashboardTiles,
        dashboardFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        addSuggestions,
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export const useDashboardContext = (): DashboardContext => {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useDashboardContext must be used within a DashboardProvider',
        );
    }
    return context;
};
