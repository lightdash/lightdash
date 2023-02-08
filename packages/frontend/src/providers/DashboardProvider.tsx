import {
    Dashboard,
    DashboardAvailableTileFilters,
    DashboardFilterRule,
    DashboardFilters,
    fieldId,
    FilterableField,
} from '@lightdash/common';
import uniqBy from 'lodash-es/uniqBy';
import React, {
    createContext,
    Dispatch,
    SetStateAction,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { FieldsWithSuggestions } from '../components/common/Filters/FiltersProvider';
import {
    useDashboardAvailableTileFilters,
    useDashboardQuery,
} from '../hooks/dashboard/useDashboard';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
};

type DashboardContext = {
    dashboard: Dashboard | undefined;
    fieldsWithSuggestions: FieldsWithSuggestions;
    dashboardTiles: Dashboard['tiles'] | [];
    setDashboardTiles: Dispatch<SetStateAction<Dashboard['tiles'] | []>>;
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setDashboardTemporaryFilters: Dispatch<SetStateAction<DashboardFilters>>;
    addDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    updateDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
    ) => void;
    removeDimensionDashboardFilter: (
        index: number,
        isTemporary: boolean,
    ) => void;
    addMetricDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    haveFiltersChanged: boolean;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    addSuggestions: (newSuggestionsMap: Record<string, string[]>) => void;
    availableFilterableFields: FilterableField[] | undefined;
    availableTileFilters: DashboardAvailableTileFilters | undefined;
};

const Context = createContext<DashboardContext | undefined>(undefined);

export const DashboardProvider: React.FC = ({ children }) => {
    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>();

    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const [dashboardTiles, setDashboardTiles] = useState<Dashboard['tiles']>(
        [],
    );

    const { isLoading, data: availableTileFilters } =
        useDashboardAvailableTileFilters(dashboardUuid);

    const availableFilterableFields = useMemo(() => {
        if (isLoading || !availableTileFilters) return;

        const allFilters = Object.values(availableTileFilters).flat();
        if (allFilters.length === 0) return;

        return uniqBy(allFilters, (f) => fieldId(f));
    }, [isLoading, availableTileFilters]);

    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});
    const [dashboardTemporaryFilters, setDashboardTemporaryFilters] =
        useState<DashboardFilters>(emptyFilters);
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
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: [...previousFilters.dimensions, filter],
                metrics: previousFilters.metrics,
            }));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters],
    );
    const updateDimensionDashboardFilter = useCallback(
        (item: DashboardFilterRule, index: number, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
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
    const addMetricDashboardFilter = useCallback(
        (filter, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: previousFilters.dimensions,
                metrics: [...previousFilters.metrics, filter],
            }));
            setHaveFiltersChanged(true);
        },
        [],
    );

    const removeDimensionDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: [
                    ...previousFilters.dimensions.slice(0, index),
                    ...previousFilters.dimensions.slice(index + 1),
                ],
                metrics: previousFilters.metrics,
            }));
            setHaveFiltersChanged(true);
        },
        [],
    );

    useEffect(() => {
        if (availableFilterableFields && availableFilterableFields.length > 0) {
            setFieldsWithSuggestions((prev) =>
                availableFilterableFields.reduce<FieldsWithSuggestions>(
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
    }, [availableFilterableFields]);

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
            setDashboardTemporaryFilters(JSON.parse(filterSearchParam));
        }
    });

    useEffect(() => {
        const newParams = new URLSearchParams();
        if (
            dashboardTemporaryFilters.dimensions.length === 0 &&
            dashboardTemporaryFilters.metrics.length === 0
        ) {
            newParams.delete('filters');
        } else {
            newParams.set('filters', JSON.stringify(dashboardTemporaryFilters));
        }

        history.replace({
            pathname,
            search: newParams.toString(),
        });
    }, [dashboardTemporaryFilters, history, pathname]);

    const value = {
        dashboard,
        fieldsWithSuggestions,
        dashboardTiles,
        setDashboardTiles,
        setDashboardTemporaryFilters,
        dashboardFilters,
        dashboardTemporaryFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        addSuggestions,
        availableFilterableFields,
        availableTileFilters,
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
