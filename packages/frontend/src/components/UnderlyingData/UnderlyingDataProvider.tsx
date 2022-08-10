import {
    ApiQueryResults,
    ChartType,
    Field,
    fieldId as getFieldId,
    FilterOperator,
    getDimensions,
    isField,
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
import { useExplore } from '../../hooks/useExplore';
import { useQueryResults } from '../../hooks/useQueryResults';
import { ExplorerState } from '../../providers/ExplorerProvider';
import { TableColumn } from '../common/Table/types';

type UnderlyingDataContext = {
    resultsData: ApiQueryResults | undefined;
    fieldsMap: Record<string, Field>;
    viewData: (value: ResultRow[0]['value'], meta: TableColumn['meta']) => void;
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

            // const shouldFetchResults =
            setState({
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        dimensions: dimensionFields,
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
        (value: ResultRow[0]['value'], meta: TableColumn['meta']) => {
            if (
                meta?.item === undefined ||
                !isField(meta?.item) ||
                isMetric(meta?.item)
            ) {
                // invalid item or table calculation or metric
                console.warn(
                    `Can't view underlying data on field `,
                    meta?.item,
                );
                return;
            }

            const tableName = meta.item.table;
            const exploreNeedsUpdate = explore?.name !== tableName;

            const filters = {
                dimensions: {
                    ...exploreState?.unsavedChartVersion.metricQuery.filters
                        .dimensions,

                    //TODO
                    id: '324ea5f7-f0cb-4840-be9c-1c468bee8d28',
                    and: [
                        {
                            id: '3e290596-099b-4361-a7a0-3f0cd91364e1',
                            target: {
                                fieldId: getFieldId(meta?.item),
                            },
                            operator: FilterOperator.EQUALS,
                            values: [value.raw],
                        },
                    ],
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
        ],
    );

    return (
        <Context.Provider
            value={{
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
