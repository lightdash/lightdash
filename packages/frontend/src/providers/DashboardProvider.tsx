import { FilterRule } from 'common';
import React, {
    createContext,
    Dispatch,
    SetStateAction,
    useCallback,
    useContext,
    useState,
} from 'react';

type DashboardFilters = {
    dimensionFilters: FilterRule[];
    metricFilters: FilterRule[] | [];
};

type DashboardContext = {
    dashboardFilters: DashboardFilters;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    addDimensionDashboardFilter: (filter: FilterRule) => void;
    addMetricDashboardFilter: (filter: FilterRule) => void;
    dimensionToFilter: string;
    setDimensionToFilter: Dispatch<SetStateAction<string>>;
};

const Context = createContext<DashboardContext>({
    dashboardFilters: { dimensionFilters: [], metricFilters: [] },
    setDashboardFilters: () => {},
    addDimensionDashboardFilter: () => {},
    addMetricDashboardFilter: () => {},
    dimensionToFilter: '',
    setDimensionToFilter: () => '',
});

export const DashboardProvider: React.FC = ({ children }) => {
    const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>({
        dimensionFilters: [],
        metricFilters: [],
    });

    const [dimensionToFilter, setDimensionToFilter] = useState<string>('');
    const addDimensionDashboardFilter = useCallback(
        (filter) => {
            setDashboardFilters((previousFilters) => ({
                dimensionFilters: [...previousFilters.dimensionFilters, filter],
                metricFilters: previousFilters.metricFilters,
            }));
        },
        [setDashboardFilters],
    );
    const addMetricDashboardFilter = useCallback(
        (filter) => {
            setDashboardFilters((previousFilters) => ({
                dimensionFilters: previousFilters.dimensionFilters,
                metricFilters: [...previousFilters.metricFilters, filter],
            }));
        },
        [setDashboardFilters],
    );
    const value = {
        dashboardFilters,
        addDimensionDashboardFilter,
        addMetricDashboardFilter,
        setDimensionToFilter,
        dimensionToFilter,
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
