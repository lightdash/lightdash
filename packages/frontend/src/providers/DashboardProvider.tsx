import { Spinner } from '@blueprintjs/core';
import { Dashboard, DashboardFilterRule, DashboardFilters } from 'common';
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
import { useDashboardQuery } from '../hooks/dashboard/useDashboard';
const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
};
type DashboardContext = {
    dashboard: Dashboard | undefined;
    canUseFilters: boolean;
    dashboardFilters: DashboardFilters | typeof emptyFilters;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    addDimensionDashboardFilter: (filter: DashboardFilterRule) => void;
    updateDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
    ) => void;
    removeDimensionDashboardFilter: (index: number) => void;
    addMetricDashboardFilter: (filter: DashboardFilterRule) => void;
};

const Context = createContext<DashboardContext | undefined>(undefined);

export const DashboardProvider: React.FC = ({ children }) => {
    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>();

    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const [dashboardFilters, setDashboardFilters] = useState<
        DashboardFilters | typeof emptyFilters
    >(emptyFilters);
    const canUseFilters = true; //!isEditMode;

    useEffect(() => {
        if (dashboard) {
            setDashboardFilters(dashboard.filters);
        }
    }, [dashboard]);

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule) => {
            if (canUseFilters) {
                setDashboardFilters((previousFilters) => ({
                    dimensions: [...previousFilters.dimensions, filter],
                    metrics: previousFilters.metrics,
                }));
            }
        },
        [setDashboardFilters, canUseFilters],
    );
    const updateDimensionDashboardFilter = useCallback(
        (item: DashboardFilterRule, index: number) => {
            if (canUseFilters) {
                setDashboardFilters((previousFilters) => ({
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        item,
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                }));
            }
        },
        [canUseFilters],
    );
    const addMetricDashboardFilter = useCallback(
        (filter) => {
            if (canUseFilters) {
                setDashboardFilters((previousFilters) => ({
                    dimensions: previousFilters.dimensions,
                    metrics: [...previousFilters.metrics, filter],
                }));
            }
        },
        [canUseFilters],
    );

    const removeDimensionDashboardFilter = useCallback(
        (index: number) => {
            if (canUseFilters) {
                setDashboardFilters((previousFilters) => ({
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                }));
            }
        },
        [canUseFilters],
    );

    const { search, pathname } = useLocation();
    const history = useHistory();

    useMount(() => {
        const searchParams = new URLSearchParams(search);
        const filterSearchParam = searchParams.get('filters');
        if (filterSearchParam && canUseFilters) {
            setDashboardFilters(JSON.parse(filterSearchParam));
        }
    });

    useEffect(() => {
        if (canUseFilters) {
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
        }
    }, [canUseFilters, dashboardFilters, history, pathname]);

    const value = {
        dashboard,
        canUseFilters,
        dashboardFilters: canUseFilters ? dashboardFilters : emptyFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        setDashboardFilters,
    };
    if (dashboard === undefined) {
        return <Spinner />;
    }
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
