import {
    ApiQueryResults,
    ChartType,
    Explore,
    Field,
    fieldId as getFieldId,
    FilterOperator,
    FilterRule,
    Filters,
    getDimensions,
    getFields,
    isDimension,
    isField,
    ResultRow,
} from '@lightdash/common';
import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { EChartSeries } from '../../hooks/echarts/useEcharts';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useQueryResults } from '../../hooks/useQueryResults';
import { ExplorerState } from '../../providers/ExplorerProvider';
import { TableColumn } from '../common/Table/types';
import { EchartSeriesClickEvent } from '../SimpleChart';

type UnderlyingDataContext = {
    tableName: string;
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<string, Field>;
    exploreFromHereUrl: string;

    viewData: (
        value: ResultRow[0]['value'],
        meta: TableColumn['meta'],
        row: ResultRow,
        pivot?: { fieldId: string; value: any },
    ) => void;

    closeModal: () => void;
};

export const getDataFromChartClick = (
    e: EchartSeriesClickEvent,
    series: EChartSeries[],
    pivot: string | undefined,
    explore: Explore,
) => {
    const selectedFields = getFields(explore).filter((field) =>
        e.dimensionNames.includes(getFieldId(field)),
    );
    const selectedDimensions = getFields(explore).filter((dimension) =>
        e.dimensionNames.includes(getFieldId(dimension)),
    );

    const selectedField =
        selectedDimensions.length > 0
            ? selectedDimensions[0]
            : selectedFields[0];
    const selectedValue = e.data[getFieldId(selectedField)];
    const row: ResultRow = Object.entries(e.data as Record<string, any>).reduce(
        (acc, entry) => {
            const [key, val] = entry;
            return { ...acc, [key]: { value: { raw: val, formatted: val } } };
        },
        {},
    );
    const withPivot =
        pivot !== undefined
            ? { fieldId: pivot, value: e.seriesName }
            : undefined;

    return {
        meta: { item: selectedField },
        value: { raw: selectedValue, formatted: selectedValue },
        row,
        pivot: withPivot,
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
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const defaultState: ExplorerState = {
        activeFields: new Set([]),
        isValidQuery: false,
        hasUnsavedChanges: false,
        isEditMode: false,
        savedChart: undefined,
        shouldFetchResults: false,
        expandedSections: [],
        unsavedChartVersion: {
            tableName: tableName,
            metricQuery: {
                dimensions: [],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
            pivotConfig: undefined,
            tableConfig: {
                columnOrder: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: { layout: {}, eChartsConfig: {} },
            },
        },
    };
    const [state, setState] = useState<ExplorerState>(defaultState);
    const { data: explore } = useExplore(tableName);

    const {
        mutate,
        data: resultsData,
        reset: resetQueryResults,
    } = useQueryResults(state);

    const fieldsMap: Record<string, Field> = useMemo(() => {
        const selectedDimensions =
            state.unsavedChartVersion.metricQuery.dimensions;
        const dimensions = explore ? getDimensions(explore) : [];
        return dimensions.reduce((acc, dimension) => {
            const fieldId = isField(dimension) ? getFieldId(dimension) : '';
            if (selectedDimensions.includes(fieldId))
                return {
                    ...acc,
                    [fieldId]: dimension,
                };
            else return acc;
        }, {});
    }, [explore, state.unsavedChartVersion.metricQuery.dimensions]);
    const closeModal = useCallback(() => {
        resetQueryResults();
    }, [resetQueryResults]);

    useEffect(() => {
        if (
            state.shouldFetchResults &&
            state.unsavedChartVersion.metricQuery.dimensions.length > 0
        ) {
            mutate();
            setState({ ...state, shouldFetchResults: false });
        }
    }, [mutate, state, setState]);

    const allFields = useMemo(
        () => (explore ? getFields(explore) : []),
        [explore],
    );
    const allDimensions = useMemo(
        () => (explore ? getDimensions(explore) : []),
        [explore],
    );

    const viewData = useCallback(
        (
            value: ResultRow[0]['value'],
            meta: TableColumn['meta'],
            row: ResultRow,
            pivot?: { fieldId: string; value: any },
        ) => {
            if (meta?.item === undefined) return;

            // We include tables from all fields that appear on the SQL query (aka tables from all columns in results)
            const rowFields = Object.keys(row);
            const fieldsInQuery = allFields.filter((field) =>
                rowFields.includes(getFieldId(field)),
            );
            const tablesInQuery = new Set([
                ...fieldsInQuery.map((field) => field.table),
                tableName,
            ]);

            // If we are viewing data from a metric or a table calculation, we filter using all existing dimensions in the table
            const dimensionFilters = !isDimension(meta?.item)
                ? Object.entries(row).reduce((acc, r) => {
                      const [
                          key,
                          {
                              value: { raw },
                          },
                      ] = r;

                      const dimensionFilter: FilterRule = {
                          id: uuidv4(),
                          target: {
                              fieldId: key,
                          },
                          operator: FilterOperator.EQUALS,
                          values: [raw],
                      };
                      const isValidDimension = allDimensions.find(
                          (dimension) => getFieldId(dimension) === key,
                      );

                      if (isValidDimension) {
                          return [...acc, dimensionFilter];
                      }
                      return acc;
                  }, [] as FilterRule[])
                : [
                      {
                          id: uuidv4(),
                          target: {
                              fieldId: getFieldId(meta?.item),
                          },
                          operator: FilterOperator.EQUALS,
                          values: [value.raw],
                      },
                  ];

            const pivotFilter: FilterRule[] = pivot
                ? [
                      {
                          id: uuidv4(),
                          target: {
                              fieldId: pivot.fieldId,
                          },
                          operator: FilterOperator.EQUALS,
                          values: [pivot.value],
                      },
                  ]
                : [];

            const exploreFilters =
                filters?.dimensions !== undefined ? [filters?.dimensions] : [];
            const combinedFilters = [
                ...exploreFilters,
                ...dimensionFilters,
                ...pivotFilter,
            ];

            const metricFilters = {
                dimensions: {
                    id: uuidv4(),
                    and: combinedFilters,
                },
            };

            const availableDimensions = allDimensions.filter(
                (dimension) =>
                    tablesInQuery.has(dimension.table) &&
                    !dimension.timeInterval &&
                    !dimension.hidden,
            );
            const dimensionFields = availableDimensions.map(getFieldId);
            setState({
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        dimensions: dimensionFields,
                        filters: metricFilters,
                    },
                    tableName: tableName,
                },
                shouldFetchResults: true,
                isValidQuery: true,
            });
        },
        [state, setState, filters, tableName, allFields, allDimensions],
    );

    const exploreFromHereUrl = useMemo(() => {
        const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            state.unsavedChartVersion,
        );
        return `${pathname}?${search}`;
    }, [state.unsavedChartVersion, projectUuid]);

    return (
        <Context.Provider
            value={{
                tableName: state.unsavedChartVersion.tableName,
                resultsData,
                fieldsMap,
                viewData,
                closeModal,
                exploreFromHereUrl,
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
