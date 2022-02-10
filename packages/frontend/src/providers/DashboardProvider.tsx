import { Dashboard, DashboardFilterRule, DashboardFilters } from 'common';
import React, {
    createContext,
    Dispatch,
    SetStateAction,
    useCallback,
    useContext,
    useState,
} from 'react';

type DashboardContext = {
    dashboard: Dashboard;
    dashboardFilters: DashboardFilters;
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

type Props = { dashboard: Dashboard };

export const DashboardProvider: React.FC<Props> = ({ dashboard, children }) => {
    const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>({
        dimensions: [],
        metrics: [],
    });

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule) => {
            setDashboardFilters((previousFilters) => ({
                dimensions: [...previousFilters.dimensions, filter],
                metrics: previousFilters.metrics,
            }));
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
        },
        [setDashboardFilters],
    );
    const addMetricDashboardFilter = useCallback(
        (filter) => {
            setDashboardFilters((previousFilters) => ({
                dimensions: previousFilters.dimensions,
                metrics: [...previousFilters.metrics, filter],
            }));
        },
        [setDashboardFilters],
    );

    const removeDimensionDashboardFilter = useCallback((index: number) => {
        setDashboardFilters((previousFilters) => ({
            dimensions: [
                ...previousFilters.dimensions.slice(0, index),
                ...previousFilters.dimensions.slice(index + 1),
            ],
            metrics: previousFilters.metrics,
        }));
    }, []);

    const value = {
        dashboard,
        dashboardFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        setDashboardFilters,
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
