import {
    ChartType,
    countTotalFilterRules,
    FilterOperator,
    findFieldByIdInExplore,
    getFilterGroupItemsPropertyName,
    getFilterRuleFromFieldWithDefaultValue,
    getItemsFromFilterGroup,
    isDimension,
    isFilterableField,
    isMetric,
    type Explore,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';
import { ExplorerSection } from '../../providers/Explorer/types';
import {
    explorerActions,
    selectChartType,
    selectDimensions,
    selectFilters,
    selectIsFiltersExpanded,
    selectMetrics,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../explorer/store';
import {
    isMcpAppFrame,
    postToMcpAppParent,
    registerMcpAppExplorerCommandHandler,
    type McpAppExplorerCommandHandler,
} from './mcpAppFrame';
import { type McpAppExplorerState } from './mcpAppFrameProtocol';

const STATE_REPORT_DELAY_MS = 300;
const CHART_TYPES = new Set<string>(Object.values(ChartType));
const FILTER_OPERATORS = new Set<string>(Object.values(FilterOperator));

const requireField = (explore: Explore | undefined, fieldId: string) => {
    if (!explore) throw new Error('The Explore is still loading');
    const field = findFieldByIdInExplore(explore, fieldId);
    if (!field) {
        throw new Error(
            `No field ${fieldId} in the ${explore.name} Explore. Use a field id such as ${explore.name}_<field>.`,
        );
    }
    return field;
};

const appendFilterRule = (
    filters: Filters,
    groupKey: 'dimensions' | 'metrics',
    rule: FilterRule,
): Filters => {
    const group = filters[groupKey];
    return {
        ...filters,
        [groupKey]: group
            ? {
                  ...group,
                  [getFilterGroupItemsPropertyName(group)]: [
                      ...getItemsFromFilterGroup(group),
                      rule,
                  ],
              }
            : { id: uuidv4(), and: [rule] },
    };
};

const ActiveMcpAppFrameExplorerBridge: FC = () => {
    const dispatch = useExplorerDispatch();
    const tableName = useExplorerSelector(selectTableName);
    const dimensions = useExplorerSelector(selectDimensions);
    const metrics = useExplorerSelector(selectMetrics);
    const filters = useExplorerSelector(selectFilters);
    const chartType = useExplorerSelector(selectChartType);
    const isFiltersExpanded = useExplorerSelector(selectIsFiltersExpanded);
    const { data: explore } = useExplore(tableName);
    const { fetchResults, queryResults, isLoading } = useExplorerQuery();
    const rowCount = queryResults.totalResults ?? null;

    const state = useMemo<McpAppExplorerState>(
        () => ({
            tableName,
            dimensions,
            metrics,
            filterCount: countTotalFilterRules(filters),
            chartType,
            rowCount,
            isRunning: isLoading,
        }),
        [
            tableName,
            dimensions,
            metrics,
            filters,
            chartType,
            rowCount,
            isLoading,
        ],
    );

    const latest = useRef({
        state,
        filters,
        explore,
        isFiltersExpanded,
        fetchResults,
    });
    latest.current = {
        state,
        filters,
        explore,
        isFiltersExpanded,
        fetchResults,
    };

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            postToMcpAppParent({
                type: 'lightdash:frame:explore',
                explore: state,
            });
        }, STATE_REPORT_DELAY_MS);
        return () => window.clearTimeout(timeout);
    }, [state]);

    useEffect(
        () => () =>
            postToMcpAppParent({
                type: 'lightdash:frame:explore',
                explore: null,
            }),
        [],
    );

    useEffect(() => {
        const handler: McpAppExplorerCommandHandler = async (request) => {
            const current = latest.current;
            switch (request.command) {
                case 'getState':
                    return current.state;
                case 'addField': {
                    const field = requireField(
                        current.explore,
                        request.args.fieldId,
                    );
                    if (isDimension(field)) {
                        dispatch(
                            explorerActions.addDimensionToQuery(
                                request.args.fieldId,
                            ),
                        );
                    } else if (isMetric(field)) {
                        dispatch(
                            explorerActions.addMetricToQuery(
                                request.args.fieldId,
                            ),
                        );
                    } else {
                        throw new Error(
                            `${request.args.fieldId} is not a dimension or metric`,
                        );
                    }
                    return { added: request.args.fieldId };
                }
                case 'removeField':
                    dispatch(explorerActions.removeField(request.args.fieldId));
                    current.fetchResults();
                    return { removed: request.args.fieldId };
                case 'addFilter': {
                    const field = requireField(
                        current.explore,
                        request.args.fieldId,
                    );
                    if (!isFilterableField(field)) {
                        throw new Error(
                            `${request.args.fieldId} cannot be filtered`,
                        );
                    }
                    const operator =
                        request.args.operator ?? FilterOperator.EQUALS;
                    if (!FILTER_OPERATORS.has(operator)) {
                        throw new Error(
                            `Unknown operator ${operator}. Use one of: ${[...FILTER_OPERATORS].join(', ')}`,
                        );
                    }
                    const rule = getFilterRuleFromFieldWithDefaultValue(
                        field,
                        {
                            id: uuidv4(),
                            target: { fieldId: request.args.fieldId },
                            operator: operator as FilterOperator,
                        },
                        request.args.values,
                    );
                    dispatch(
                        explorerActions.setFilters(
                            appendFilterRule(
                                current.filters,
                                isDimension(field) ? 'dimensions' : 'metrics',
                                rule,
                            ),
                        ),
                    );
                    if (!current.isFiltersExpanded) {
                        dispatch(
                            explorerActions.toggleExpandedSection(
                                ExplorerSection.FILTERS,
                            ),
                        );
                    }
                    current.fetchResults();
                    return { filter: rule };
                }
                case 'setChartType': {
                    const { chartType: requested } = request.args;
                    if (!CHART_TYPES.has(requested)) {
                        throw new Error(
                            `Unknown chart type ${requested}. Use one of: ${[...CHART_TYPES].join(', ')}`,
                        );
                    }
                    dispatch(
                        explorerActions.setChartType({
                            chartType: requested as ChartType,
                        }),
                    );
                    return { chartType: requested };
                }
                case 'runQuery':
                    current.fetchResults();
                    return { running: true };
                default:
                    throw new Error('Unknown command');
            }
        };
        return registerMcpAppExplorerCommandHandler(handler);
    }, [dispatch]);

    return null;
};

export const McpAppFrameExplorerBridge: FC = () =>
    isMcpAppFrame() ? <ActiveMcpAppFrameExplorerBridge /> : null;
