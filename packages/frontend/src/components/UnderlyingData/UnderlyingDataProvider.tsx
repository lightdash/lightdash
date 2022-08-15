import {
    ApiQueryResults,
    ChartType,
    DimensionType,
    Field,
    fieldId as getFieldId,
    FilterOperator,
    FilterRule,
    Filters,
    getDimensions,
    getFields,
    isField,
    isMetric,
    ResultRow,
    TimeInterval,
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
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../hooks/useExplore';
import { useQueryResults } from '../../hooks/useQueryResults';
import { ExplorerState } from '../../providers/ExplorerProvider';
import { TableColumn } from '../common/Table/types';

type UnderlyingDataContext = {
    tableName: string;
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<string, Field>;
    viewData: (
        value: ResultRow[0]['value'],
        meta: TableColumn['meta'],
        row: ResultRow,
    ) => void;
    closeModal: () => void;
};

const Context = createContext<UnderlyingDataContext | undefined>(undefined);

type Props = {
    tableName: string;
    filters?: Filters;
};

const isDateDimension = (dimensions: Field[], dimensionName: string) => {
    const dateDimensions = dimensions.filter(
        (dimension) =>
            dimension.type === DimensionType.TIMESTAMP ||
            dimension.type === DimensionType.DATE,
    );
    const dateDimension = dateDimensions.find((dimension) => {
        const dateIntervals = Object.values(TimeInterval).map(
            (interval) => `${getFieldId(dimension)}_${interval.toLowerCase()}`,
        );
        return dateIntervals.find(
            (fieldInterval) => fieldInterval === dimensionName,
        );
    });
    return dateDimension !== undefined;
};

export const UnderlyingDataProvider: FC<Props> = ({
    tableName,
    filters,
    children,
}) => {
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

            const availableDimensions = allDimensions.filter(
                (dimension) =>
                    tablesInQuery.has(dimension.table) &&
                    !dimension.timeInterval &&
                    !dimension.hidden,
            );

            // If we are viewing data from a metric or a table calculation, we filter using all existing dimensions in the table
            const dimensionFilters =
                !isField(meta?.item) || isMetric(meta?.item)
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
                          const isDimension = availableDimensions.find(
                              (dimension) => getFieldId(dimension) === key,
                          );

                          if (
                              isDimension ||
                              isDateDimension(availableDimensions, key)
                          ) {
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

            const metricFilters = {
                dimensions: {
                    ...filters?.dimensions,
                    id: uuidv4(),
                    and: dimensionFilters,
                },
            };

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
                    //tableName: filterTable !== undefined ? filterTable : tableName,
                },
                shouldFetchResults: true,
                isValidQuery: true,
            });
        },
        [
            state,
            setState,
            filters?.dimensions,
            tableName,
            allFields,
            allDimensions,
        ],
    );

    return (
        <Context.Provider
            value={{
                tableName: state.unsavedChartVersion.tableName,
                resultsData,
                fieldsMap,
                viewData,
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
