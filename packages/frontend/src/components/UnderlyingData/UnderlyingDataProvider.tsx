import {
    ApiQueryResults,
    ChartType,
    Field,
    fieldId as getFieldId,
    FieldType,
    FilterOperator,
    friendlyName,
    getDimensions,
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
        isValidQuery: true,
        hasUnsavedChanges: false,
        isEditMode: false,
        savedChart: undefined,
        shouldFetchResults: false,
        expandedSections: [],
        unsavedChartVersion: {
            tableName: 'test',
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

    const dimensions = useMemo(
        () => (explore ? getDimensions(explore) : []),
        [explore],
    );

    const {
        mutate,
        data: resultsData,
        reset: resetQueryResults,
    } = useQueryResults(state);

    const fieldsMap: Record<string, Field> = useMemo(() => {
        const row = resultsData?.rows?.[0];
        if (row) {
            const tableName = state.unsavedChartVersion.tableName;

            const entries = Object.entries(row);
            const m: Record<string, Field> = entries.reduce(
                (acc, [key, value]) => {
                    const fieldName = key.replace(`${tableName}_`, '');
                    return {
                        ...acc,
                        [key]: {
                            fieldType: FieldType.DIMENSION,
                            type: 'string', // Discriminator field
                            name: fieldName, // Field names are unique within a table
                            label: friendlyName(fieldName), // Friendly name
                            table: tableName, // Table names are unique within the project
                            tableLabel: friendlyName(tableName), // Table friendly name
                            sql: '', // Templated sql
                            hidden: false,
                        },
                    };
                },
                {} as Record<string, Field>,
            );
            return m;
        } else {
            return {};
        }
    }, [resultsData?.rows, state.unsavedChartVersion.tableName]);

    const closeModal = useCallback(() => {
        resetQueryResults();
    }, [resetQueryResults]);

    useEffect(() => {
        if (exploreState)
            setState({ ...exploreState, shouldFetchResults: false });
    }, [exploreState, setState]);

    useEffect(() => {
        if (state.shouldFetchResults) {
            mutate();
            setState({ ...state, shouldFetchResults: false });
        }
    }, [mutate, state, setState]);

    const viewData = useCallback(
        (value: ResultRow[0]['value'], meta: TableColumn['meta']) => {
            if (meta?.item === undefined || !isField(meta?.item)) {
                //TODO disable option
                console.warn(
                    `Can't view underlying data on field ${meta?.item}`,
                );
                return;
            }

            const dimensionFields = dimensions.map(getFieldId);
            // TODO if table name is different, we need to wait for explore to fetch the dimensions before making the SQL request
            setState({
                ...state,
                unsavedChartVersion: {
                    ...state.unsavedChartVersion,
                    metricQuery: {
                        ...state.unsavedChartVersion.metricQuery,
                        metrics: [],
                        dimensions: dimensionFields,
                        filters: {
                            dimensions: {
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
                        },
                    },
                    tableName: meta.item.table,
                },
                shouldFetchResults: true,
            });
        },
        [state, setState, dimensions],
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
