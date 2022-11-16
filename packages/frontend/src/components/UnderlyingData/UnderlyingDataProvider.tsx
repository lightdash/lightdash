import {
    DashboardFilters,
    Field,
    Filters,
    getItemId,
    hashFieldReference,
    isDimension,
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
import { TableColumn } from '../common/Table/types';
import { EchartSeriesClickEvent } from '../SimpleChart';

type UnderlyingDataConfig = {
    value: ResultRow[0]['value'];
    meta: TableColumn['meta'];
    row: ResultRow;
    dimensions?: string[];
    pivotReference?: PivotReference;
    dashboardFilters?: DashboardFilters;
};

type UnderlyingDataContext = {
    tableName: string;
    filters?: Filters;
    config: UnderlyingDataConfig | undefined;
    isModalOpen: boolean;
    viewData: (
        value: ResultRow[0]['value'],
        meta: TableColumn['meta'],
        row: ResultRow,
        dimensions?: string[],
        pivotReference?: PivotReference,
        dashboardFilters?: DashboardFilters,
    ) => void;
    closeModal: () => void;
};

export const getDataFromChartClick = (
    e: EchartSeriesClickEvent,
    itemsMap: Record<string, Field | TableCalculation>,
    series: EChartSeries[],
): UnderlyingDataConfig => {
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
const Context = createContext<UnderlyingDataContext | undefined>(undefined);

type Props = {
    tableName: string;
    filters?: Filters;
};

export const UnderlyingDataProvider: FC<Props> = ({
    tableName,
    filters,
    children,
}) => {
    const [config, setConfig] = useState<UnderlyingDataConfig>();
    const [isModalOpen, setModalOpen] = useState<boolean>(false);

    const closeModal = useCallback(() => {
        setModalOpen(false);
    }, []);

    const viewData = useCallback(
        (
            value: ResultRow[0]['value'],
            meta: TableColumn['meta'],
            row: ResultRow,
            dimensions?: string[],
            pivotReference?: PivotReference,
            dashboardFilters?: DashboardFilters,
        ) => {
            setConfig({
                value,
                meta,
                row,
                dimensions,
                pivotReference,
                dashboardFilters,
            });

            setModalOpen(true);
        },
        [setConfig],
    );

    return (
        <Context.Provider
            value={{
                tableName,
                filters,
                config,
                viewData,
                isModalOpen,
                closeModal,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export function useUnderlyingDataContext(): UnderlyingDataContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useUnderlyingDataContext must be used within a UnderlyingDataProvider',
        );
    }
    return context;
}

export default UnderlyingDataProvider;
