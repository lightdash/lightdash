import {
    ApiQueryResults,
    ChartType,
    Field,
    fieldId as getFieldId,
    FilterOperator,
    FilterRule,
    getDimensions,
    isAndFilterGroup,
    isField,
    isFilterRule,
    isMetric,
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
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useQueryResults } from '../../hooks/useQueryResults';
import { ExplorerState } from '../../providers/ExplorerProvider';
import { TableColumn } from '../common/Table/types';

type UnderlyingDataContext = {
    tableName: string;
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<string, Field>;
    exploreFromHereUrl: string;
    viewData: (
        value: ResultRow[0]['value'],
        meta: TableColumn['meta'],
        row: ResultRow,
    ) => void;
    closeModal: () => void;
};

const Context = createContext<UnderlyingDataContext | undefined>(undefined);

type Props = {
    exploreState?: ExplorerState;
};

export const UnderlyingDataProvider: FC<Props> = ({
    exploreState,
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
            tableName: '',
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
    const { data: explore } = useExplore(state.unsavedChartVersion.tableName);
    const [updateExplore, setUpdateExplore] = useState<boolean>(false);
    const dimensions = useMemo(
        () =>
            explore
                ? getDimensions(explore).filter(
                      (dimension) =>
                          !dimension.timeInterval && !dimension.hidden,
                  )
                : [],
        [explore],
    );

    const {
        mutate,
        data: resultsData,
        reset: resetQueryResults,
    } = useQueryResults(state);

    const fieldsMap: Record<string, Field> = useMemo(() => {
        return dimensions.reduce((acc, dimension) => {
            const fieldId = isField(dimension) ? getFieldId(dimension) : '';
            return {
                ...acc,
                [fieldId]: dimension,
            };
        }, {});
    }, [dimensions]);

    const closeModal = useCallback(() => {
        resetQueryResults();
    }, [resetQueryResults]);

    useEffect(() => {
        //if table name is different, we need to wait for explore to fetch the dimensions before making the SQL request
        if (
            explore?.name === state.unsavedChartVersion.tableName &&
            updateExplore
        ) {
            const dimensionFields = dimensions.map(getFieldId);
            const dimensionFilters =
                state.unsavedChartVersion.metricQuery.filters.dimensions;
            const validDimensionFilters =
                dimensionFilters && isAndFilterGroup(dimensionFilters)
                    ? dimensionFilters?.and.reduce((acc, filter) => {
                          if (isFilterRule(filter)) {
                              const filterField = filter.target.fieldId;
                              const isDimension = dimensions.find(
                                  (dimension) =>
                                      getFieldId(dimension) === filterField,
                              );
                              if (isDimension) return [...acc, filter];
                          }
                          return acc;
                      }, [] as FilterRule[])
                    : [];

            setState({
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        dimensions: dimensionFields,
                        filters: {
                            dimensions: {
                                id: uuidv4(),
                                and: validDimensionFilters,
                            },
                        },
                    },
                },
                shouldFetchResults: true,
                isValidQuery: true,
            });

            setUpdateExplore(false);
        }
    }, [explore, state, setState, dimensions, updateExplore]);

    useEffect(() => {
        //if table name is different, we need to wait for explore to fetch the dimensions before making the SQL request
        if (
            state.shouldFetchResults &&
            explore?.name === state.unsavedChartVersion.tableName &&
            state.unsavedChartVersion.metricQuery.dimensions.length > 0
        ) {
            mutate();
            setState({ ...state, shouldFetchResults: false });
        }
    }, [explore, mutate, state, setState]);

    const viewData = useCallback(
        (
            value: ResultRow[0]['value'],
            meta: TableColumn['meta'],
            row: ResultRow,
        ) => {
            if (meta?.item === undefined) return;

            const tableName: string = isField(meta?.item)
                ? meta.item.table
                : exploreState?.unsavedChartVersion.tableName || '';

            const exploreNeedsUpdate = explore?.name !== tableName;

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
                          const isDimension = dimensions.find(
                              (dimension) => getFieldId(dimension) === key,
                          );

                          if (exploreNeedsUpdate || isDimension) {
                              // Some of these filters might belong to metrics, not dimensions
                              // we will filter invalid metric filters before doing the request on explore update hook
                              // because we depend on the `dimensions` state, which might not be uptodate now
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

            const filters = {
                dimensions: {
                    ...exploreState?.unsavedChartVersion.metricQuery.filters
                        .dimensions,
                    id: uuidv4(),
                    and: dimensionFilters,
                },
            };
            if (exploreNeedsUpdate) {
                setUpdateExplore(true);

                setState({
                    ...state,
                    unsavedChartVersion: {
                        ...state.unsavedChartVersion,
                        metricQuery: {
                            ...state.unsavedChartVersion.metricQuery,
                            filters,
                        },
                        tableName: tableName,
                    },
                    shouldFetchResults: false,
                    isValidQuery: true,
                });
            } else {
                const dimensionFields = dimensions.map(getFieldId);

                // const shouldFetchResults =
                setState({
                    ...state,
                    unsavedChartVersion: {
                        ...state.unsavedChartVersion,
                        metricQuery: {
                            ...state.unsavedChartVersion.metricQuery,
                            dimensions: dimensionFields,
                            filters,
                        },
                        tableName: tableName,
                    },
                    shouldFetchResults: true,
                    isValidQuery: true,
                });
            }
        },
        [
            state,
            setState,
            dimensions,
            exploreState?.unsavedChartVersion.metricQuery,
            explore?.name,
            exploreState?.unsavedChartVersion.tableName,
        ],
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
