import {
    DashboardFilters,
    Explore,
    Field,
    getItemId,
    hashFieldReference,
    isDimension,
    MetricQuery,
    PivotReference,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useState,
} from 'react';
import { EChartSeries } from '../../hooks/echarts/useEcharts';
import { useExplore } from '../../hooks/useExplore';
import { TableColumn } from '../common/Table/types';
import { EchartSeriesClickEvent } from '../SimpleChart';

type MetricQueryDataConfig = {
    value: ResultRow[0]['value'];
    meta: TableColumn['meta'];
    row: ResultRow;
    dimensions?: string[];
    pivotReference?: PivotReference;
    dashboardFilters?: DashboardFilters;
};

type DrillDownConfig = {
    row: ResultRow;
    selectedItem: Field | TableCalculation;
    pivotReference?: PivotReference;
    dashboardFilters?: DashboardFilters;
};

type MetricQueryDataContext = {
    tableName: string;
    explore: Explore | undefined;
    metricQuery?: MetricQuery;
    underlyingDataConfig: MetricQueryDataConfig | undefined;
    isUnderlyingDataModalOpen: boolean;
    openUnderlyingDataModel: (
        value: ResultRow[0]['value'],
        meta: TableColumn['meta'],
        row: ResultRow,
        dimensions?: string[],
        pivotReference?: PivotReference,
        dashboardFilters?: DashboardFilters,
    ) => void;
    closeUnderlyingDataModal: () => void;

    drillDownConfig: DrillDownConfig | undefined;
    isDrillDownModalOpen: boolean;
    openDrillDownModel: (config: DrillDownConfig) => void;
    closeDrillDownModal: () => void;
};

export const getDataFromChartClick = (
    e: EchartSeriesClickEvent,
    itemsMap: Record<string, Field | TableCalculation>,
    series: EChartSeries[],
): MetricQueryDataConfig => {
    const pivotReference = series[e.seriesIndex]?.pivotReference;
    const selectedFields = Object.values(itemsMap).filter((item) => {
        if (
            !isDimension(item) &&
            pivotReference &&
            pivotReference.field === getItemId(item)
        ) {
            return e.dimensionNames.includes(
                hashFieldReference(pivotReference),
            );
        }
        return e.dimensionNames.includes(getItemId(item));
    });
    const selectedMetricsAndTableCalculations = selectedFields.filter(
        (item) => !isDimension(item),
    );

    const selectedField =
        selectedMetricsAndTableCalculations.length > 0
            ? selectedMetricsAndTableCalculations[0]
            : selectedFields[0];
    const selectedValue = e.data[getItemId(selectedField)];
    const row: ResultRow = Object.entries(e.data as Record<string, any>).reduce(
        (acc, entry) => {
            const [key, val] = entry;
            return { ...acc, [key]: { value: { raw: val, formatted: val } } };
        },
        {},
    );

    return {
        meta: { item: selectedField },
        value: { raw: selectedValue, formatted: selectedValue },
        row,
        pivotReference,
    };
};
const Context = createContext<MetricQueryDataContext | undefined>(undefined);

type Props = {
    tableName: string;
    metricQuery: MetricQuery | undefined;
};

export const MetricQueryDataProvider: FC<Props> = ({
    tableName,
    metricQuery,
    children,
}) => {
    const [underlyingDataConfig, setUnderlyingDataConfig] =
        useState<MetricQueryDataConfig>();
    const [drillDownConfig, setDrillDownConfig] = useState<DrillDownConfig>();
    const [isUnderlyingDataModalOpen, setIsUnderlyingDataModalOpen] =
        useState<boolean>(false);
    const [isDrillDownModalOpen, setIsDrillDownModalOpen] =
        useState<boolean>(false);
    const { data: explore } = useExplore(tableName);
    const openDrillDownModel = useCallback(
        (config: DrillDownConfig) => {
            setDrillDownConfig(config);
            setIsDrillDownModalOpen(true);
        },
        [setDrillDownConfig],
    );
    const closeDrillDownModal = useCallback(() => {
        setIsDrillDownModalOpen(false);
    }, []);
    const closeUnderlyingDataModal = useCallback(() => {
        setIsUnderlyingDataModalOpen(false);
    }, []);

    const openUnderlyingDataModel = useCallback(
        (
            value: ResultRow[0]['value'],
            meta: TableColumn['meta'],
            row: ResultRow,
            dimensions?: string[],
            pivotReference?: PivotReference,
            dashboardFilters?: DashboardFilters,
        ) => {
            setUnderlyingDataConfig({
                value,
                meta,
                row,
                dimensions,
                pivotReference,
                dashboardFilters,
            });

            setIsUnderlyingDataModalOpen(true);
        },
        [setUnderlyingDataConfig],
    );

    return (
        <Context.Provider
            value={{
                tableName,
                metricQuery,
                underlyingDataConfig,
                openUnderlyingDataModel,
                isUnderlyingDataModalOpen,
                closeUnderlyingDataModal,
                isDrillDownModalOpen,
                drillDownConfig,
                openDrillDownModel,
                closeDrillDownModal,
                explore,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export function useMetricQueryDataContext(): MetricQueryDataContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useUnderlyingDataContext must be used within a UnderlyingDataProvider',
        );
    }
    return context;
}

export default MetricQueryDataProvider;
