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
    getFieldRef,
    isAndFilterGroup,
    isCustomBinDimension,
    isDashboardFieldTarget,
    isDashboardScheduler,
    isFilterRule,
    isOrFilterGroup,
    MetricFilterRule,
    MetricQuery,
    NameChanges,
    ParameterError,
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
export const createRenameFactory = ({
    from,
    to,
    fromReference,
    toReference,
    isPrefix,
    fromFieldName,
    toFieldName,
}: NameChanges & { isPrefix: boolean }) => {
    let replaceId: (str: string) => string;
    let replaceReference: (str: string) => string;
    let replaceString: (str: string) => string;
    let replaceFieldReference: (str: string) => string;
    let replaceFieldName: (str: string) => string;
    let replaceDotFieldId: (str: string) => string;
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
        replaceDotFieldId = (str: string) =>
            str.replace(new RegExp(`^${from}\\.`, 'g'), `${to}.`);
        replaceFieldReference = (str: string) => str; // table prefix (eg: payment_)

        replaceFieldName = (str: string) => str; // no changes
    } else {
        replaceFieldName = (str: string) =>
            str.replace(
                new RegExp(`^${fromFieldName}$`, 'g'),
                `${toFieldName}`,
            ); // field name (eg: customer_id)
        replaceId = (str: string) =>
            str.replace(new RegExp(`^${from}$`, 'g'), `${to}`); // entire id (eg: payment_customer_id)
        replaceReference = (str: string) =>
            str.replace(
                new RegExp(`\\$\\{${fromReference}\\}`, 'g'),
                `\${${toReference}}`,
            ); // Full reference
        replaceDotFieldId = (str: string) =>
            str.replace(
                new RegExp(`^${fromReference}$`, 'g'),
                `${toReference}`,
            ); // used in custom metric filters (eg: orders.status)
        replaceString = (str: string) =>
            str.replace(new RegExp(`${from}`, 'g'), `${to}`);
        replaceFieldReference = (str: string) => {
            // These are for ${TABLE}.field references like in additionalMetrics
            // We only update here if the str is the same as the expected fromReference
            // to avoid updating other references
            if (str.startsWith('${TABLE}')) {
                const strWithoutTable = str.split('.')[1];
                const fromReferenceWithoutTable = fromReference.split('.')[1];
                const toReferenceWithoutTable = toReference.split('.')[1];
                if (strWithoutTable === fromReferenceWithoutTable) {
                    return str.replace(
                        fromReferenceWithoutTable,
                        toReferenceWithoutTable,
                    );
                }
                return str;
            }
            return replaceReference(str);
        };
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
        replaceFieldReference,
        replaceFieldName,
        replaceDotFieldId,
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
    objectType: 'chart' | 'dashboard' | 'alert' | 'dashboard scheduler',
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
                `Validation check failed: Renaming "${objectType}" "${objectName}" from model "${from}" to "${to}" was not successful.`,
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
                )}`, // Do not add new lines, this will make it harder to read on GCP
            );
            console.warn(
                `Full actual: ${JSON.stringify(JSON.parse(normalizedActual))}`,
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
                      value && isDashboardFieldTarget(value)
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
        replaceFieldReference,
        replaceFieldName,
        replaceDotFieldId,
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
            filters: am.filters?.map((cmf) => {
                const renamedFilter: MetricFilterRule = {
                    ...cmf,
                    target: cmf.target?.fieldRef
                        ? {
                              fieldRef: replaceDotFieldId(cmf.target.fieldRef),
                          }
                        : cmf.target,
                };
                return renamedFilter;
            }),
            table: replaceFull(am.table),
            baseDimensionName: am.baseDimensionName
                ? replaceFieldName(am.baseDimensionName)
                : undefined,
            sql: replaceFieldReference(am.sql), // This reference can contain a ${TABLE} too
        })),
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

export const getNameChanges = ({
    from,
    to,
    table,
    type,
}: {
    from: string;
    to: string;
    table: string;
    type: RenameType;
    fromFieldName?: string;
    toFieldName?: string;
}): NameChanges => {
    if (from === to) {
        throw new ParameterError(
            'Old and new names are the same, nothing to rename',
        );
    }

    if (type === RenameType.FIELD) {
        // Both must start with the same table prefix, this means the fieldId is only a field rename

        if (!from.startsWith(`${table}_`) && to.startsWith(`${table}_`)) {
            throw new ParameterError(
                'New name does not start with the same table prefix as the old name',
            );
        }
        const fromWithoutTable = from.replace(`${table}_`, '');
        const toWithoutTable = to.replace(`${table}_`, '');
        return {
            from,
            to,
            fromReference: getFieldRef({
                table,
                name: fromWithoutTable,
            }),
            toReference: getFieldRef({
                table,
                name: toWithoutTable,
            }),
            fromFieldName: fromWithoutTable,
            toFieldName: toWithoutTable,
        };
    }
    // MODEL rename
    return {
        from,
        to,
        fromReference: from,
        toReference: to,
        fromFieldName: undefined,
        toFieldName: undefined,
    };
};

const addSuffixIfPrefix = (value: string, isPrefix: boolean) =>
    `${value}${isPrefix ? '_' : ''}`;

const buildModelNameChecker = (searchTerms: string[]) => (model: Object) => {
    const stringified = JSON.stringify(model);
    return searchTerms.some((term) => term && stringified.includes(term));
};

export const renameSavedChart = ({
    type,
    chart,
    nameChanges,
    validate = false,
}: {
    type: RenameType;
    chart: SavedChartDAO;
    nameChanges: NameChanges;
    validate: boolean;
}): { updatedChart: SavedChartDAO; hasChanges: boolean } => {
    const isPrefix = type === RenameType.MODEL;

    const searchTerms = [
        addSuffixIfPrefix(nameChanges.from, isPrefix),
        addSuffixIfPrefix(nameChanges.fromReference, isPrefix),
        // fromFieldName is only available when rename type is FIELD
        nameChanges.fromFieldName
            ? addSuffixIfPrefix(nameChanges.fromFieldName, isPrefix)
            : null,
    ].filter((s) => s !== null);

    const containsModelName = buildModelNameChecker(searchTerms);
    if (!containsModelName(chart)) {
        // These should be filtered already by model anyway
        return { updatedChart: chart, hasChanges: false };
    }

    const renameMethods = createRenameFactory({
        ...nameChanges,
        isPrefix,
    });
    const { replaceList } = renameMethods;

    // Create a shallow copy instead of deep clone
    const updatedChart = { ...chart };
    if (type === RenameType.MODEL && chart.tableName === nameChanges.from) {
        updatedChart.tableName = nameChanges.to;
    }

    if (containsModelName(chart.metricQuery)) {
        updatedChart.metricQuery = renameMetricQuery(
            chart.metricQuery,
            renameMethods,
        );
    }

    if (containsModelName(chart.chartConfig)) {
        updatedChart.chartConfig = renameChartConfigType(
            chart.chartConfig,
            renameMethods,
        );
    }
    if (containsModelName(chart.tableConfig)) {
        updatedChart.tableConfig = {
            columnOrder: replaceList(chart.tableConfig.columnOrder),
        };
    }
    if (chart.pivotConfig && containsModelName(chart.pivotConfig)) {
        updatedChart.pivotConfig = {
            columns: replaceList(updatedChart.pivotConfig?.columns || []),
        };
    }

    if (validate)
        validateRename(chart, updatedChart, chart.name, 'chart', nameChanges);

    // Only mark changes if there was actually an update. There are renameFunctions that won't change the values if not needed
    const hasChanges = JSON.stringify(chart) !== JSON.stringify(updatedChart);
    return { updatedChart, hasChanges };
};

export const renameDashboard = (
    type: RenameType,
    dashboard: DashboardDAO,
    nameChanges: NameChanges,
    validate: boolean = false,
): { updatedDashboard: DashboardDAO; hasChanges: boolean } => {
    const isPrefix = type === RenameType.MODEL;

    let hasChanges = false;

    const containsModelName = buildModelNameChecker([
        addSuffixIfPrefix(nameChanges.from, isPrefix),
    ]);

    if (!containsModelName(dashboard)) {
        return { updatedDashboard: dashboard, hasChanges: false };
    }

    const renameMethods = createRenameFactory({
        ...nameChanges,
        isPrefix,
    });

    // Create a shallow copy instead of deep clone
    const updatedDashboard = { ...dashboard };

    if (containsModelName(dashboard.filters)) {
        hasChanges = true;
        updatedDashboard.filters = renameDashboardFilters(
            dashboard.filters,
            renameMethods,
        );
    }

    if (validate)
        validateRename(
            dashboard,
            updatedDashboard,
            updatedDashboard.name,
            'dashboard',
            nameChanges,
        );

    return { updatedDashboard, hasChanges };
};

export const renameAlert = (
    type: RenameType,
    alert: SchedulerAndTargets,
    nameChanges: NameChanges,
    validate: boolean = false,
): { updatedAlert: SchedulerAndTargets; hasChanges: boolean } => {
    const isPrefix = type === RenameType.MODEL;

    const containsModelName = buildModelNameChecker([
        addSuffixIfPrefix(nameChanges.from, isPrefix),
    ]);

    if (!alert.thresholds) {
        return { updatedAlert: alert, hasChanges: false };
    }

    const { replaceId } = createRenameFactory({
        ...nameChanges,
        isPrefix,
    });
    let hasChanges = false;
    const updatedAlert = { ...alert };
    if (containsModelName(alert)) {
        hasChanges = true;
        updatedAlert.thresholds = alert.thresholds.map((t) => ({
            ...t,
            fieldId: replaceId(t.fieldId),
        }));
    }

    if (validate)
        validateRename(alert, updatedAlert, alert.name, 'alert', nameChanges);

    return { updatedAlert, hasChanges };
};

export const renameDashboardScheduler = (
    type: RenameType,
    dashboardScheduler: SchedulerAndTargets,
    nameChanges: NameChanges,
    validate: boolean = false,
): { updatedDashboardScheduler: SchedulerAndTargets; hasChanges: boolean } => {
    const isPrefix = type === RenameType.MODEL;

    const containsModelName = buildModelNameChecker([
        addSuffixIfPrefix(nameChanges.from, isPrefix),
    ]);

    if (!isDashboardScheduler(dashboardScheduler)) {
        return {
            updatedDashboardScheduler: dashboardScheduler,
            hasChanges: false,
        };
    }

    const { replaceId, replaceFull, replaceFieldName } = createRenameFactory({
        ...nameChanges,
        isPrefix,
    });
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

            if ('fieldName' in target && typeof target.fieldName === 'string') {
                // FilterDashboardToRule
                return {
                    ...target,
                    fieldId: replaceId(target.fieldId),
                    fieldName: replaceFieldName(target.fieldName), // nameChanges.toReference.replace(`${target.tableName}_`, ''), // Removes table prefix
                };
            }
            return target;
        };

        updatedDashboardScheduler.filters = dashboardScheduler.filters?.map(
            (t) => ({
                ...t,
                target: updateTarget(t.target),
            }),
        );
    }

    if (validate)
        validateRename(
            dashboardScheduler,
            updatedDashboardScheduler,
            dashboardScheduler.name,
            'dashboard scheduler',
            nameChanges,
        );

    return { updatedDashboardScheduler, hasChanges };
};
