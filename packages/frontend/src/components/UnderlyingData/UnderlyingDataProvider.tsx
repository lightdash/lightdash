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
        const dimensions = explore
            ? getDimensions(explore).filter(
                  (dimension) =>
                      dimension.table === state.unsavedChartVersion.tableName &&
                      !dimension.timeInterval &&
                      !dimension.hidden,
              )
            : [];

        return dimensions.reduce((acc, dimension) => {
            const fieldId = isField(dimension) ? getFieldId(dimension) : '';
            return {
                ...acc,
                [fieldId]: dimension,
            };
        }, {});
    }, [explore, state.unsavedChartVersion.tableName]);
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

    const viewData = useCallback(
        (
            value: ResultRow[0]['value'],
            meta: TableColumn['meta'],
            row: ResultRow,
        ) => {
            if (meta?.item === undefined) return;

            // If we are viewing data form a joined table, we filter that table and those fields in the query
            const filterTable =
                isField(meta?.item) && !isMetric(meta?.item)
                    ? meta.item.table
                    : undefined;

            const availableDimensions = explore
                ? getDimensions(explore).filter(
                      (dimension) =>
                          (filterTable !== undefined
                              ? dimension.table === filterTable
                              : true) &&
                          !dimension.timeInterval &&
                          !dimension.hidden,
                  )
                : [];

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
                    tableName:
                        filterTable !== undefined ? filterTable : tableName,
                },
                shouldFetchResults: true,
                isValidQuery: true,
            });
        },
        [state, setState, explore, filters?.dimensions, tableName],
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
