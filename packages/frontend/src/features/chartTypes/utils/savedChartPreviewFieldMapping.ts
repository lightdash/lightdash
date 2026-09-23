import {
    assertUnreachable,
    ChartType,
    getDataAppVizFieldIds,
    getHiddenTableFields,
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type SavedChart,
} from '@lightdash/common';
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from './autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from './getDataAppVizFieldItems';

export type SavedChartBindingSource = Pick<
    SavedChart,
    'chartConfig' | 'pivotConfig' | 'metricQuery'
>;

type Roles = { dimension: string[]; series: string[]; metric: string[] };

const getSourceRoles = (chart: SavedChartBindingSource): Roles => {
    const { chartConfig, pivotConfig, metricQuery } = chart;
    const roles: Roles = {
        dimension: [],
        series: pivotConfig?.columns ?? [],
        metric: [],
    };
    switch (chartConfig.type) {
        case ChartType.CARTESIAN:
            roles.dimension = chartConfig.config?.layout.xField
                ? [chartConfig.config.layout.xField]
                : [];
            roles.metric = chartConfig.config?.layout.yField ?? [];
            break;
        case ChartType.TABLE: {
            const hidden = getHiddenTableFields(chartConfig);
            roles.series = roles.series.filter((id) => !hidden.includes(id));
            roles.dimension = (
                pivotConfig?.rows ?? metricQuery.dimensions
            ).filter(
                (id) => !roles.series.includes(id) && !hidden.includes(id),
            );
            roles.metric = [
                ...metricQuery.metrics,
                ...metricQuery.tableCalculations.map(({ name }) => name),
            ].filter((id) => !hidden.includes(id));
            break;
        }
        case ChartType.PIE:
            roles.dimension = chartConfig.config?.groupFieldIds ?? [];
            roles.metric = chartConfig.config?.metricId
                ? [chartConfig.config.metricId]
                : [];
            break;
        case ChartType.TREEMAP:
            roles.dimension = chartConfig.config?.groupFieldIds ?? [];
            roles.metric = [
                chartConfig.config?.sizeMetricId,
                chartConfig.config?.colorMetricId,
            ].filter((id): id is string => !!id);
            break;
        case ChartType.BIG_NUMBER:
            roles.metric = chartConfig.config?.selectedField
                ? [chartConfig.config.selectedField]
                : [];
            break;
        case ChartType.GAUGE:
            roles.metric = [
                chartConfig.config?.selectedField,
                chartConfig.config?.maxFieldId,
            ].filter((id): id is string => !!id);
            break;
        case ChartType.SANKEY:
            roles.dimension = [
                chartConfig.config?.sourceFieldId,
                chartConfig.config?.targetFieldId,
            ].filter((id): id is string => !!id);
            roles.metric = chartConfig.config?.metricFieldId
                ? [chartConfig.config.metricFieldId]
                : [];
            break;
        case ChartType.MAP:
            roles.dimension = [
                chartConfig.config?.locationFieldId,
                chartConfig.config?.latitudeFieldId,
                chartConfig.config?.longitudeFieldId,
            ].filter((id): id is string => !!id);
            roles.metric = [
                chartConfig.config?.valueFieldId,
                chartConfig.config?.sizeFieldId,
            ].filter((id): id is string => !!id);
            break;
        case ChartType.FUNNEL:
            roles.metric = chartConfig.config?.fieldId
                ? [chartConfig.config.fieldId]
                : [];
            break;
        case ChartType.DATA_APP_VIZ: {
            // Slot names are local to a chart type; retain the selected fields'
            // roles rather than interpreting names from another schema.
            const mappedIds = [
                ...new Set(
                    Object.values(
                        chartConfig.config?.fieldMapping ?? {},
                    ).flatMap(getDataAppVizFieldIds),
                ),
            ];
            roles.series = roles.series.filter((id) => mappedIds.includes(id));
            roles.dimension = mappedIds.filter(
                (id) =>
                    metricQuery.dimensions.includes(id) &&
                    !roles.series.includes(id),
            );
            const measures = [
                ...metricQuery.metrics,
                ...metricQuery.tableCalculations.map(({ name }) => name),
            ];
            roles.metric = mappedIds.filter((id) => measures.includes(id));
            break;
        }
        case ChartType.CUSTOM:
            break;
        default:
            return assertUnreachable(chartConfig, 'Unknown saved chart type');
    }
    return roles;
};

/** Seed from the source chart's semantic roles before filling unspecified inputs. */
export const mapSavedChartPreviewFields = ({
    fields,
    itemsMap,
    sourceChart,
    dataAppVizUuid,
}: {
    fields: DataAppVizField[];
    itemsMap: ItemsMap;
    sourceChart: SavedChartBindingSource | null;
    dataAppVizUuid: string | null;
}): DataAppVizFieldMapping => {
    if (!sourceChart) return autoMapDataAppVizFields(fields, itemsMap);
    const { chartConfig } = sourceChart;
    if (
        chartConfig.type === ChartType.DATA_APP_VIZ &&
        chartConfig.config?.dataAppVizUuid === dataAppVizUuid
    ) {
        return reconcileDataAppVizFieldMapping(
            fields,
            itemsMap,
            chartConfig.config.fieldMapping,
        );
    }
    const hidden = getHiddenTableFields(chartConfig);
    const visibleItems = Object.fromEntries(
        Object.entries(itemsMap).filter(([id]) => !hidden.includes(id)),
    );
    const { dimensions, metrics } = getDataAppVizFieldItems(visibleItems);
    const dimensionIds = dimensions.map(getItemId);
    const metricIds = metrics.map(getItemId);
    const roles = getSourceRoles(sourceChart);
    const candidates = {
        dimension: roles.dimension.filter((id) => dimensionIds.includes(id)),
        series: roles.series.filter((id) => dimensionIds.includes(id)),
        metric: roles.metric.filter((id) => metricIds.includes(id)),
        column: [...roles.metric, ...roles.dimension].filter(
            (id) => metricIds.includes(id) || dimensionIds.includes(id),
        ),
    };
    const mapping: DataAppVizFieldMapping = {};
    const used = new Set<string>();
    const slots = [
        ...fields.filter((field) => field.required),
        ...fields.filter((field) => !field.required),
    ];
    for (const field of slots) {
        const id = candidates[field.type].find(
            (candidate) => !used.has(candidate),
        );
        if (!id) continue;
        mapping[field.name] = field.multiple ? [id] : id;
        used.add(id);
    }
    for (const field of slots) {
        if (!field.multiple || mapping[field.name] === undefined) continue;
        const extras = [...new Set(candidates[field.type])].filter(
            (id) => !used.has(id),
        );
        mapping[field.name] = [
            ...getDataAppVizFieldIds(mapping[field.name]),
            ...extras,
        ];
        extras.forEach((id) => used.add(id));
    }
    return {
        ...mapping,
        ...autoMapDataAppVizFields(
            fields.filter((field) => mapping[field.name] === undefined),
            Object.fromEntries(
                Object.entries(visibleItems).filter(([id]) => !used.has(id)),
            ),
        ),
    };
};
