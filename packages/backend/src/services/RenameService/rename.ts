import {
    AnyType,
    assertUnreachable,
    ChartConfig,
    ChartType,
    CustomVis,
    DashboardDAO,
    DashboardFieldTarget,
    DashboardFilterRule,
    DashboardFilters,
    FilterGroup,
    FilterGroupItem,
    Filters,
    isAndFilterGroup,
    isCustomBinDimension,
    isDashboardScheduler,
    isFilterRule,
    isOrFilterGroup,
    MetricQuery,
    NameChanges,
    RenameType,
    SavedChartDAO,
    SchedulerAndTargets,
} from '@lightdash/common';

/* There are different methods to replace model names
 replaceId: Replace only the start of a string, with the new model prefix
 replaceReference: Replace the reference string part (eg: ${payment.) with the new model name, needed for SQL strings and more complex references
 replaceString: Do a full string replacement with the new model name, used only if others don't apply, used in custom viz (vega-lite)
 and some other functions to deal with undefined, lists and objects
*/
export const createRenameFactory = (
    from: string,
    to: string,
    fromReference: string,
    toReference: string,
    isPrefix: boolean,
) => {
    let replaceId: (str: string) => string;
    let replaceReference: (str: string) => string;
    let replaceString: (str: string) => string;
    if (isPrefix) {
        replaceId = (str: string) =>
            str.replace(new RegExp(`^${from}_`, 'g'), `${to}_`); // table prefix (eg: payment_)
        replaceReference = (str: string) =>
            str.replace(
                new RegExp(`\\$\\{${fromReference}\\.`, 'g'),
                `\${${toReference}.`,
            ); // SQL normally uses "." on references
        replaceString = (str: string) =>
            str.replace(new RegExp(`${from}_`, 'g'), `${to}_`);
    } else {
        replaceId = (str: string) =>
            str.replace(new RegExp(`^${from}$`, 'g'), `${to}`); // entire id (eg: payment_customer_id)
        replaceReference = (str: string) =>
            str.replace(
                new RegExp(`\\$\\{${fromReference}\\}`, 'g'),
                `\${${toReference}}`,
            ); // Full reference
        replaceString = (str: string) =>
            str.replace(new RegExp(`${from}`, 'g'), `${to}`);
    }

    return {
        replaceId,
        replaceString,
        replaceReference,
        replaceOptionalId: (str: string | undefined) =>
            str ? replaceId(str) : undefined,
        replaceKeys: <T>(obj: Record<string, T>) => {
            const keyValues = Object.keys(obj).map((key) => {
                const newKey = replaceId(key);
                return { [newKey]: obj[key] };
            });
            return Object.assign({}, ...keyValues);
        },
        replaceFull: (str: string) => str.replaceAll(from, to), // Full name replace, used in tables
        replaceList: (list: string[]) => list.map((item) => replaceId(item)),
        replaceOptionalList: (list: string[] | undefined) =>
            list ? list.map((item) => replaceId(item)) : undefined,
    };
};

/*
We are renaming fields in the object 
This is only for validating that the we are replacing all the fields needed
*/
export const validateRename = (
    originalObject: Object,
    updatedObject: Object,
    objectName: string,
    { from, fromReference, to, toReference }: NameChanges,
) => {
    try {
        // Instead of trying to compare the entire objects, let's just compare the stringified versions
        // after normalizing them (parsing and stringifying to remove any non-enumerable properties)
        const normalizeAndReplace = (obj: AnyType): string =>
            JSON.stringify(JSON.parse(JSON.stringify(obj)))
                .replaceAll(from, to)
                .replaceAll(fromReference, toReference);

        const normalizeObject = (obj: AnyType): string =>
            JSON.stringify(JSON.parse(JSON.stringify(obj)));

        const normalizedExpected = normalizeAndReplace(originalObject);
        const normalizedActual = normalizeObject(updatedObject);

        if (normalizedExpected !== normalizedActual) {
            // If the normalized strings don't match, try comparing with sorted keys
            const sortObjectKeys = (obj: AnyType): AnyType => {
                if (obj === null || typeof obj !== 'object') return obj;

                if (Array.isArray(obj)) {
                    return obj.map(sortObjectKeys);
                }

                const sortedObj: AnyType = {};
                Object.keys(obj)
                    .sort()
                    .forEach((key) => {
                        sortedObj[key] = sortObjectKeys(obj[key]);
                    });
                return sortedObj;
            };

            const sortedExpected = JSON.stringify(
                sortObjectKeys(JSON.parse(normalizeAndReplace(originalObject))),
            );
            const sortedActual = JSON.stringify(
                sortObjectKeys(JSON.parse(normalizeObject(updatedObject))),
            );

            if (sortedExpected === sortedActual) {
                // Objects are equal after sorting keys
                return;
            }

            // At this point, we've tried multiple approaches and the objects are still different
            console.warn(
                `Validation check failed: Renaming chart "${objectName}" from model "${from}" to "${to}" was not successful.`,
            );

            // Since the objects appear identical in the output but are still different,
            // let's try to find the exact difference by comparing character by character
            console.warn(
                'Character length comparison: expected:',
                normalizedExpected.length,
                'got:',
                normalizedActual.length,
            );

            if (normalizedExpected.length === normalizedActual.length) {
                let diffCount = 0;
                const diffPositions = [];

                for (let i = 0; i < normalizedExpected.length; i += 1) {
                    if (normalizedExpected[i] !== normalizedActual[i]) {
                        diffCount += 1;
                        if (diffPositions.length < 5) {
                            diffPositions.push(i);
                        }
                    }
                }

                console.warn(`Found ${diffCount} character differences`);

                diffPositions.forEach((pos) => {
                    const start = Math.max(0, pos - 10);
                    const end = Math.min(pos + 10, normalizedExpected.length);
                    console.warn(`Difference at position ${pos}:`);
                    console.warn(
                        `Expected: ...${normalizedExpected.substring(
                            start,
                            pos,
                        )}[${
                            normalizedExpected[pos]
                        }]${normalizedExpected.substring(pos + 1, end)}...`,
                    );
                    console.warn(
                        `Got:      ...${normalizedActual.substring(
                            start,
                            pos,
                        )}[${
                            normalizedActual[pos]
                        }]${normalizedActual.substring(pos + 1, end)}...`,
                    );
                });
            }

            // Log the full objects for reference
            console.warn(
                `Full expected: ${JSON.stringify(
                    JSON.parse(normalizedExpected),
                    null,
                    2,
                )}`,
            );
            console.warn(
                `Full actual: ${JSON.stringify(
                    JSON.parse(normalizedActual),
                    null,
                    2,
                )}`,
            );
        }
    } catch (e) {
        console.error(
            `Failed to validate rename ${objectName} from ${from} to ${to}: ${e}`,
        );
    }
};

export const renameChartConfigType = (
    chartConfig: ChartConfig,
    {
        replaceId,
        replaceOptionalList,
        replaceOptionalId,
        replaceString,
        replaceReference,
    }: ReturnType<typeof createRenameFactory>,
): ChartConfig => {
    const chartType = chartConfig.type;
    switch (chartType) {
        case ChartType.CARTESIAN:
            return {
                ...chartConfig,
                config: {
                    ...chartConfig.config,
                    layout: {
                        ...chartConfig.config?.layout,
                        xField: replaceOptionalId(
                            chartConfig.config?.layout.xField,
                        ),
                        yField: replaceOptionalList(
                            chartConfig.config?.layout?.yField,
                        ),
                    },
                    eChartsConfig: {
                        // Reference lines don't seem to have a saved reference, they are added to the series in the frontend

                        ...chartConfig.config?.eChartsConfig,
                        series: chartConfig.config?.eChartsConfig?.series?.map(
                            (series) => ({
                                ...series,
                                stack: replaceOptionalId(series.stack),
                                encode: {
                                    ...series.encode,
                                    xRef: {
                                        field: replaceId(
                                            series.encode.xRef.field,
                                        ),
                                    },
                                    yRef: {
                                        field: replaceId(
                                            series.encode.yRef.field,
                                        ),
                                        pivotValues: series.encode.yRef
                                            .pivotValues
                                            ? series.encode.yRef.pivotValues.map(
                                                  (pv) => ({
                                                      ...pv,
                                                      field: replaceId(
                                                          pv.field,
                                                      ),
                                                  }),
                                              )
                                            : undefined,
                                    },
                                },
                            }),
                        ),
                        tooltip: chartConfig.config?.eChartsConfig?.tooltip
                            ? replaceString(
                                  chartConfig.config?.eChartsConfig?.tooltip,
                              ) // Not exactly a reference, since the format is different (eg: ${payment.amount} vs ${payment_amount})
                            : undefined,
                    },
                    metadata: chartConfig.config?.metadata
                        ? Object.fromEntries(
                              Object.entries(chartConfig.config?.metadata).map(
                                  ([key, value]) => [replaceString(key), value], // These Ids can contain pivot info (eg: payment_id.shipped)
                              ),
                          )
                        : undefined,
                },
            };
        case ChartType.BIG_NUMBER:
            return {
                ...chartConfig,
                config: {
                    ...chartConfig.config,
                    selectedField: replaceOptionalId(
                        chartConfig.config?.selectedField,
                    ),
                },
            };

        case ChartType.TABLE:
            return {
                ...chartConfig,
                config: {
                    ...chartConfig.config,
                    columns: Object.fromEntries(
                        Object.entries(chartConfig.config?.columns || {}).map(
                            ([key, value]) => [replaceId(key), value],
                        ),
                    ), // replaceKeys<ColumnProperties>(chartConfig.config?.columns || {})
                    conditionalFormattings: chartConfig.config
                        ?.conditionalFormattings
                        ? chartConfig.config?.conditionalFormattings.map(
                              (cd) => ({
                                  ...cd,
                                  target: cd.target
                                      ? {
                                            ...cd.target,
                                            fieldId: replaceId(
                                                cd.target.fieldId,
                                            ),
                                        }
                                      : null,
                              }),
                          )
                        : undefined,
                },
            };

        case ChartType.PIE:
            return {
                ...chartConfig,
                config: {
                    ...chartConfig.config,
                    metricId: replaceOptionalId(chartConfig.config?.metricId),
                    groupFieldIds: chartConfig.config?.groupFieldIds
                        ? chartConfig.config.groupFieldIds.map((fieldId) =>
                              replaceId(fieldId),
                          )
                        : undefined,
                },
            };
        case ChartType.FUNNEL:
            return {
                ...chartConfig,
                config: {
                    ...chartConfig.config,
                    fieldId: replaceOptionalId(chartConfig.config?.fieldId),
                },
            };
        case ChartType.CUSTOM:
            return {
                ...chartConfig,
                config: {
                    ...chartConfig.config,
                    spec: JSON.parse(
                        replaceString(JSON.stringify(chartConfig.config?.spec)),
                    ) as CustomVis['spec'],
                },
            };

        default:
            assertUnreachable(
                chartType,
                `Unsupported chart type: ${chartType}`,
            );
    }
    return chartConfig;
};

export const renameFilterGroups = (
    filters: FilterGroup | FilterGroupItem,
    replaceModelPrefix: (str: string) => string,
): FilterGroup | FilterGroupItem => {
    if (isAndFilterGroup(filters)) {
        return {
            ...filters,
            and: filters.and.map((g) =>
                renameFilterGroups(g, replaceModelPrefix),
            ),
        };
    }

    if (isOrFilterGroup(filters)) {
        return {
            ...filters,
            or: filters.or.map((g) =>
                renameFilterGroups(g, replaceModelPrefix),
            ),
        };
    }

    if (isFilterRule(filters)) {
        return {
            ...filters,
            target: filters.target
                ? {
                      ...filters.target,
                      fieldId: replaceModelPrefix(filters.target.fieldId),
                  }
                : filters.target,
        };
    }

    throw new Error(
        `Invalid filter format ${JSON.stringify(filters)}, ${filters}`,
    );
};

export const renameFilters = (
    filters: Filters,
    replaceModelPrefix: (str: string) => string,
): Filters => ({
    dimensions: filters.dimensions
        ? (renameFilterGroups(
              filters.dimensions,
              replaceModelPrefix,
          ) as FilterGroup)
        : undefined,
    metrics: filters.metrics
        ? (renameFilterGroups(
              filters.metrics,
              replaceModelPrefix,
          ) as FilterGroup)
        : undefined,
    tableCalculations: filters.tableCalculations
        ? (renameFilterGroups(
              filters.tableCalculations,
              replaceModelPrefix,
          ) as FilterGroup)
        : undefined,
});

export const renameDashboardFilterRules = (
    filterRules: DashboardFilterRule[],
    { replaceFull, replaceId }: ReturnType<typeof createRenameFactory>,
): DashboardFilterRule[] =>
    filterRules.map((filterRule) => ({
        ...filterRule,
        target: {
            ...filterRule.target,
            fieldId: replaceId(filterRule.target.fieldId),
            tableName: replaceFull(filterRule.target.tableName),
        },
        tileTargets: filterRule.tileTargets
            ? Object.fromEntries(
                  Object.entries(filterRule.tileTargets).map(([key, value]) => [
                      key,
                      value
                          ? {
                                ...value,
                                fieldId: replaceId(value.fieldId),
                                tableName: replaceFull(value.tableName),
                            }
                          : value,
                  ]),
              )
            : undefined,
    }));

const renameDashboardFilters = (
    filters: DashboardFilters,
    methods: ReturnType<typeof createRenameFactory>,
): DashboardFilters => ({
    dimensions: renameDashboardFilterRules(filters.dimensions, methods),
    metrics: renameDashboardFilterRules(filters.metrics, methods),
    tableCalculations: renameDashboardFilterRules(
        filters.tableCalculations,
        methods,
    ),
});

export const renameMetricQuery = (
    metricQuery: MetricQuery,
    {
        replaceId,
        replaceList,
        replaceFull,
        replaceReference,
    }: ReturnType<typeof createRenameFactory>,
): MetricQuery => {
    const updatedMetricQuery = {
        ...metricQuery,
        exploreName: replaceFull(metricQuery.exploreName),
        dimensions: replaceList(metricQuery.dimensions),
        metrics: replaceList(metricQuery.metrics),
        filters: renameFilters(metricQuery.filters, replaceId),
        tableCalculations: metricQuery.tableCalculations?.map((tc) => ({
            ...tc,
            sql: replaceReference(tc.sql),
        })),
        additionalMetrics: metricQuery.additionalMetrics?.map((am) => ({
            ...am,
            table: replaceFull(am.table),
            sql: replaceReference(am.sql),
        })), // TODO replace also filters
        customDimensions: metricQuery.customDimensions?.map((cd) =>
            isCustomBinDimension(cd)
                ? {
                      ...cd,
                      table: replaceFull(cd.table),
                      dimensionId: replaceId(cd.dimensionId),
                  }
                : { ...cd, sql: replaceReference(cd.sql) },
        ),
        sorts: metricQuery.sorts?.map((s) => ({
            ...s,
            fieldId: replaceId(s.fieldId),
        })),
    };

    return updatedMetricQuery;
};

export const renameSavedChart = (
    type: RenameType,
    chart: SavedChartDAO,
    { from, fromReference, to, toReference }: NameChanges,
): { updatedChart: SavedChartDAO; hasChanges: boolean } => {
    let hasChanges = false;

    const isPrefix = type === RenameType.MODEL;
    const containsModelName = (object: Object) =>
        JSON.stringify(object).includes(`${from}${isPrefix ? '_' : ''}`);

    if (!containsModelName(chart)) {
        console.debug(`No references to "${from}" in chart "${chart.name}"`);
        // These should be filtered already by model anyway
        return { updatedChart: chart, hasChanges: false };
    }

    const renameMethods = createRenameFactory(
        from,
        to,
        fromReference,
        toReference,
        isPrefix,
    );
    const { replaceList } = renameMethods;

    // Create a shallow copy instead of deep clone
    const updatedChart = { ...chart };
    if (type === RenameType.MODEL && chart.tableName === from) {
        hasChanges = true;
        updatedChart.tableName = to;
    }

    if (containsModelName(chart.metricQuery)) {
        hasChanges = true;
        updatedChart.metricQuery = renameMetricQuery(
            chart.metricQuery,
            renameMethods,
        );
    }

    if (containsModelName(chart.chartConfig)) {
        hasChanges = true;
        updatedChart.chartConfig = renameChartConfigType(
            chart.chartConfig,
            renameMethods,
        );
    }
    if (containsModelName(chart.tableConfig)) {
        hasChanges = true;
        updatedChart.tableConfig = {
            columnOrder: replaceList(chart.tableConfig.columnOrder),
        };
    }
    if (chart.pivotConfig && containsModelName(chart.pivotConfig)) {
        hasChanges = true;
        updatedChart.pivotConfig = {
            columns: replaceList(updatedChart.pivotConfig?.columns || []),
        };
    }

    validateRename(chart, updatedChart, chart.name, {
        from,
        fromReference,
        to,
        toReference,
    });

    return { updatedChart, hasChanges };
};

export const renameDashboard = (
    type: RenameType,
    dashboard: DashboardDAO,
    { from, fromReference, to, toReference }: NameChanges,
): { updatedDashboard: DashboardDAO; hasChanges: boolean } => {
    const isPrefix = type === RenameType.MODEL;

    let hasChanges = false;

    const containsModelName = (object: Object) =>
        JSON.stringify(object).includes(`${from}${isPrefix ? '_' : ''}`);

    if (!containsModelName(dashboard)) {
        return { updatedDashboard: dashboard, hasChanges: false };
    }

    const renameMethods = createRenameFactory(
        from,
        to,
        fromReference,
        toReference,
        isPrefix,
    );

    // Create a shallow copy instead of deep clone
    const updatedDashboard = { ...dashboard };

    if (containsModelName(dashboard.filters)) {
        hasChanges = true;
        updatedDashboard.filters = renameDashboardFilters(
            dashboard.filters,
            renameMethods,
        );
    }

    validateRename(dashboard, updatedDashboard, updatedDashboard.name, {
        from,
        fromReference,
        to,
        toReference,
    });

    return { updatedDashboard, hasChanges };
};

export const renameAlert = (
    type: RenameType,
    alert: SchedulerAndTargets,
    { from, fromReference, to, toReference }: NameChanges,
): { updatedAlert: SchedulerAndTargets; hasChanges: boolean } => {
    const isPrefix = type === RenameType.MODEL;

    const containsModelName = (object: Object) =>
        JSON.stringify(object).includes(`${from}${isPrefix ? '_' : ''}`);

    if (!alert.thresholds) {
        return { updatedAlert: alert, hasChanges: false };
    }

    const { replaceId } = createRenameFactory(
        from,
        to,
        fromReference,
        toReference,
        isPrefix,
    );
    let hasChanges = false;
    const updatedAlert = { ...alert };
    if (containsModelName(alert)) {
        hasChanges = true;
        updatedAlert.thresholds = alert.thresholds.map((t) => ({
            ...t,
            fieldId: replaceId(t.fieldId),
        }));
    }

    validateRename(alert, updatedAlert, `Alert: ${alert.name}`, {
        from,
        fromReference,
        to,
        toReference,
    });

    return { updatedAlert, hasChanges };
};

export const renameDashboardScheduler = (
    type: RenameType,
    dashboardScheduler: SchedulerAndTargets,
    { from, fromReference, to, toReference }: NameChanges,
): { updatedDashboardScheduler: SchedulerAndTargets; hasChanges: boolean } => {
    const isPrefix = type === RenameType.MODEL;

    const containsModelName = (object: Object) =>
        JSON.stringify(object).includes(`${from}${isPrefix ? '_' : ''}`);

    if (!isDashboardScheduler(dashboardScheduler)) {
        return {
            updatedDashboardScheduler: dashboardScheduler,
            hasChanges: false,
        };
    }

    const { replaceId, replaceFull } = createRenameFactory(
        from,
        to,
        fromReference,
        toReference,
        isPrefix,
    );
    let hasChanges = false;
    const updatedDashboardScheduler = { ...dashboardScheduler };
    if (containsModelName(dashboardScheduler)) {
        hasChanges = true;

        const updateTarget = (target: DashboardFieldTarget) => {
            /* sample target filter:    
                "target": {
                    "fieldId": "purchases_payment_method",
                    "fieldName": "payment_method",
                    "tableName": "purchases"
                },
            */
            if (isPrefix) {
                return {
                    ...target,
                    fieldId: replaceId(target.fieldId),
                    tableName: replaceFull(target.tableName),
                };
            }

            return {
                ...target,
                fieldId: replaceId(target.fieldId),
                fieldName: toReference.replace(`${target.tableName}_`, ''), // Removes table prefix
            };
        };

        updatedDashboardScheduler.filters = dashboardScheduler.filters?.map(
            (t) => ({
                ...t,
                target: updateTarget(t.target),
            }),
        );
    }

    validateRename(
        dashboardScheduler,
        updatedDashboardScheduler,
        `Alert: ${dashboardScheduler.name}`,
        {
            from,
            fromReference,
            to,
            toReference,
        },
    );

    return { updatedDashboardScheduler, hasChanges };
};
